import re
from pathlib import Path

from spacy.lang.es.stop_words import STOP_WORDS

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

from .expansion_nombres import expandir_nombres
from .reconocedores.cedula import ReconocedorCedula
from .reconocedores.direccion import ReconocedorDireccion
from .reconocedores.edad import ReconocedorEdad
from .reconocedores.eps import ReconocedorEPS
from .reconocedores.fecha import ReconocedorFecha
from .reconocedores.nombre import ReconocedorNombreMayusculas
from .reconocedores.email_espaciado import ReconocedorEmailEspaciado
from .reconocedores.nombre_gazetteer import ReconocedorNombreGazetteer, _normalizar, cargar_nombres
from .reconocedores.registro_medico import ReconocedorRegistroMedico
from .reconocedores.telefono import ReconocedorTelefonoColombia


# Etiqueta de reemplazo para cada categoría de PII.
ETIQUETAS_PII: dict[str, str] = {
    "nombres":           "[NOMBRE]",
    "documentos":        "[DOCUMENTO]",
    "telefonos":         "[TELEFONO]",
    "fechas_nacimiento": "[FECHA_NAC]",
    "direcciones":       "[DIRECCION]",
    "emails":            "[EMAIL]",
    "fechas":            "[FECHA]",
    "edades":            "[EDAD]",
    "ubicaciones":       "[UBICACION]",
    "seguros":           "[SEGURO]",
    "numeros_registro":  "[NUM_REGISTRO]",
}

# Mapeo de tipos de entidad de Presidio a nuestras categorías.
# PHONE_NUMBER (built-in) omitido: demasiado genérico para números colombianos,
# produce falsos positivos con cédulas. Se usa solo TELEFONO_CO (nuestro recognizer).
MAPA_ENTIDADES: dict[str, str] = {
    "PERSON":        "nombres",
    "EMAIL_ADDRESS": "emails",
    "TELEFONO_CO":   "telefonos",
    "DATE_TIME":     "fechas",
    "FECHA_CO":      "fechas",
    "EDAD_CO":       "edades",
    "DIRECCION_CO":  "direcciones",
    "LOCATION":      "ubicaciones",
    "CEDULA_CO":     "documentos",
    "EPS_CO":        "seguros",
    "REGISTRO_CO":   "numeros_registro",
    "NOMBRE_MAYUS":  "nombres",
    "NOMBRE_GAZETTEER": "nombres",
    "EMAIL_ESPACIADO": "emails",
}

# Palabras que spaCy clasifica erróneamente como entidades en texto clínico.
# Se comparan en minúsculas contra el valor del match.
FALSOS_POSITIVOS_NER: dict[str, set[str]] = {
    "ubicaciones": {
        "cédula", "cedula", "diagnóstico", "diagnostico", "tel", "fax", "av",
        # Etiquetas de campo y sustantivos de parentesco que spaCy confunde con
        # LOCATION en exports sin cabecera demográfica (ver "nombres" abajo).
        "id cliente", "id consulta", "madre", "padre", "acudiente", "abuela",
        "abuelo", "hermano", "hermana",
    },
    "nombres":     {
        "tel", "fax", "av", "dr", "dra", "cc", "ti",
        # Sustantivos clínicos comunes que spaCy etiqueta como PERSON (no nombres).
        "peso", "talla", "cuello", "riñones", "mucosas", "cita", "salud", "obs",
        "vol", "reg", "familiares", "perinatales", "hermano", "especialista",
        "prescripción", "prescripcion", "aclaratorias", "bipedestación",
        "bipedestacion", "hipertelorismo", "hipotrofia", "hipofosfatasia",
        # Etiquetas de campo de exports tipo "Id Cliente / Id Consulta /
        # Diagnóstico" (sin cabecera demográfica): spaCy las etiqueta como PERSON
        # por aparecer solas, en mayúscula inicial, al principio del documento.
        "id cliente", "id consulta", "antecedentes",
        # Inicio de oración / etiquetas de campo que spaCy toma por PERSON
        # ("Cualquier novedad notificar…", "Correo:", "Procedencia:").
        "cualquier", "correo", "procedencia", "c.c.", "c.c",
    },
}

# Entidades de spaCy (NER estadístico), a diferencia de los reconocedores por patrón.
_ENTIDADES_NER = {"PERSON", "LOCATION"}

_GAZETTEER = cargar_nombres()
_LUGARES = {
    _normalizar(linea.strip())
    for linea in (Path(__file__).parent / "datos" / "lugares_co.txt").read_text(encoding="utf-8").splitlines()
    if linea.strip() and not linea.startswith("#")
}

# Longitud mínima de caracteres para aceptar un match de LOCATION.
MIN_LONGITUD_UBICACION = 4

# Nota: se probó normalizar mayúsculas corridas a Título antes de una segunda
# pasada de spaCy, para el caso de notas dictadas enteras en mayúsculas (ver
# datos_sintetico_ame). Se descartó con datos: sobre ese dataset el recall de
# nombres no mejoró (81/84 en ambos casos) pero la precisión cayó de 84.9% a
# 63.5% — spaCy empieza a leer vocabulario clínico titulado ("Fototerapia",
# "Turno", "Síndrome Diarreico Agudo") como PERSON. Ver bitácora de evaluación.

class DetectorPII:
    """
    Detecta PII con Presidio (determinista): patrones + NER de spaCy en español.
    Cubre: nombres, emails, teléfonos, cédulas, fechas, ubicaciones, EPS.

    Todo el procesamiento es local: en la app de escritorio no hay fallback a un
    LLM en la nube (el servicio original usaba WatsonX), para que ningún dato
    del paciente salga del equipo.
    """

    def __init__(self):
        self._analizador = self._construir_analizador()

    def detectar(self, texto: str) -> dict[str, set[str]]:
        """Retorna {categoria: conjunto de valores detectados en el texto}."""
        return self._detectar_con_presidio(texto)

    def _construir_analizador(self) -> AnalyzerEngine:
        configuration = {
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "es", "model_name": "es_core_news_md"}],
        }
        nlp_engine = NlpEngineProvider(nlp_configuration=configuration).create_engine()

        # Let AnalyzerEngine build and configure the registry for Spanish,
        # then add our custom Colombian recognizers on top.
        analizador = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["es"])
        analizador.registry.add_recognizer(ReconocedorCedula())
        analizador.registry.add_recognizer(ReconocedorTelefonoColombia())
        analizador.registry.add_recognizer(ReconocedorEPS())
        analizador.registry.add_recognizer(ReconocedorFecha())
        analizador.registry.add_recognizer(ReconocedorEdad())
        analizador.registry.add_recognizer(ReconocedorDireccion())
        analizador.registry.add_recognizer(ReconocedorRegistroMedico())
        analizador.registry.add_recognizer(ReconocedorNombreMayusculas())
        analizador.registry.add_recognizer(ReconocedorNombreGazetteer())
        analizador.registry.add_recognizer(ReconocedorEmailEspaciado())
        return analizador

    def _detectar_con_presidio(self, texto: str) -> dict[str, set[str]]:
        pii: dict[str, set[str]] = {cat: set() for cat in ETIQUETAS_PII}
        resultados = self._analizador.analyze(text=texto, language="es")
        for r in resultados:
            categoria = MAPA_ENTIDADES.get(r.entity_type)
            if not categoria:
                continue
            valor = texto[r.start:r.end].strip()
            if r.entity_type in _ENTIDADES_NER:
                # spaCy a veces cruza saltos de línea ("Cundinamarca\nDirección: Cra
                # 45C N", "barrio Manga\nTeléfono"): lo de después es otro campo.
                valor = valor.split("\n")[0].strip()
            if not valor:
                continue
            if r.entity_type == "LOCATION" and len(valor) < MIN_LONGITUD_UBICACION:
                continue
            if valor.lower() in FALSOS_POSITIVOS_NER.get(categoria, set()):
                continue
            if r.entity_type in _ENTIDADES_NER and not self._ner_plausible(r.entity_type, valor):
                continue
            pii[categoria].add(valor)
        pii["nombres"] = expandir_nombres(texto, pii["nombres"])
        return self._descartar_subsumidos(texto, pii)

    def _ner_plausible(self, entidad: str, valor: str) -> bool:
        """Filtra el NER estadístico de spaCy donde es poco fiable.

        En exports todo en minúscula y sin tildes, spaCy etiqueta como lugar o
        persona casi cualquier término clínico ("canula", "inhaloterapia",
        "luxacion", "adiciona(n"): en un lote real de 100 historias, más del 90 %
        de sus LOCATION y la mitad de sus PERSON eran de este tipo. Ahí solo se
        acepta lo que tenga respaldo: un lugar colombiano conocido, o al menos
        una palabra que sea un nombre/apellido del gazetteer. Con mayúsculas se
        confía en spaCy, salvo un PERSON hecho solo de palabras comunes del idioma
        ("Evolucion Consulta Externa").
        """
        tokens = [_normalizar(t) for t in re.findall(r"[^\W\d_]+", valor)]
        if not tokens:
            return False
        en_gazetteer = any(t in _GAZETTEER and t not in STOP_WORDS for t in tokens)
        if entidad == "LOCATION":
            if valor.islower():
                return " ".join(tokens) in _LUGARES or tokens[-1] in _LUGARES
            return True
        if valor.islower():
            return en_gazetteer
        comunes = all(self._palabra_comun(t) for t in tokens)
        return en_gazetteer or not comunes

    def _palabra_comun(self, token: str) -> bool:
        lexema = self._analizador.nlp_engine.nlp["es"].vocab[token]
        return token in STOP_WORDS or lexema.has_vector

    def _descartar_subsumidos(self, texto: str, pii: dict[str, set[str]]) -> dict[str, set[str]]:
        """Descarta valores que son un fragmento de otro valor más largo, EN
        CUALQUIER CATEGORÍA (p. ej. 'Eliana' bajo nombres cuando ya está 'Eliana
        Ibargüen Segura'; o 'OSCAR CORTÉS' bajo nombres cuando spaCy también
        etiquetó 'DR OSCAR CORTÉS JURADO' completo como LOCATION). Ocurre porque
        varios reconocedores —spaCy, gazetteer, NOMBRE_MAYUS— cubren el mismo
        nombre con spans distintos, a veces bajo entity_type/categoría distinta,
        y Presidio solo resuelve solapes dentro del mismo entity_type.

        Solo se descarta un valor si TODAS sus apariciones en el texto quedan
        dentro de una aparición del valor más largo. Si alguna aparece suelta
        (p. ej. spaCy marcó 'Huila\nDirección: Av 128B # 83-59' como LOCATION y
        la misma dirección vuelve a salir sola más abajo), descartarla dejaría
        esa segunda aparición SIN REDACTAR: una fuga real. El Reemplazador
        aplica los valores de mayor a menor longitud, así que conservar el
        fragmento no rompe el reemplazo del valor largo."""
        bajo = texto.lower()

        def apariciones(valor: str) -> list[tuple[int, int]]:
            v = valor.lower()
            return [(m.start(), m.start() + len(v)) for m in re.finditer(re.escape(v), bajo)]

        valores = {v for vals in pii.values() for v in vals}
        spans = {v: apariciones(v) for v in valores}
        acolchados = {v: f" {v.lower()} " for v in valores}

        def subsumido(v: str) -> bool:
            contenedores = [
                span for otro in valores
                if otro != v and acolchados[v] in acolchados[otro]
                for span in spans[otro]
            ]
            return bool(contenedores) and all(
                any(ci <= ini and fin <= cf for ci, cf in contenedores) for ini, fin in spans[v]
            )

        sobreviven = {v for v in valores if not subsumido(v)}
        for categoria in pii:
            pii[categoria] = {v for v in pii[categoria] if v in sobreviven}
        return pii
