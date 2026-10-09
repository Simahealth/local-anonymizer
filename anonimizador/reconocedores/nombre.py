import re
import unicodedata

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

# Secuencia de 2 a 4 palabras EN MAYÚSCULAS (cada una de 2+ letras, con tildes/Ñ).
# spaCy (es_core_news_md) se entrenó en caja normal y no reconoce nombres así
# (MYRIAM VANESSA RUEDA GALVIS), muy comunes en formularios de historia clínica.
# Separador SOLO espacios/tabs (no saltos de línea): un nombre va en una línea.
_PALABRA = r"[A-ZÁÉÍÓÚÜÑ]{2,}"
_NOMBRE_MAYUS = re.compile(rf"\b{_PALABRA}(?:[ \t]+{_PALABRA}){{1,3}}\b")

# Ancla de contexto: un nombre real en estos formularios va junto a un número de
# identificación (cédula/RM, 7–11 dígitos) o a una marca de nombre (Paciente,
# Autor, Especialista, Dr., RM, Tarjeta de identidad…). Las órdenes de laboratorio
# en mayúsculas (FOSFATASA ALCALINA, CALCIO IONICO) no tienen ese contexto.
#
# Esta ancla laxa (ventana amplia, vocabulario genérico) sirve para el caso para
# el que se diseñó: un campo de formulario en mayúsculas dentro de un documento
# en caja normal ("Paciente: MYRIAM VANESSA RUEDA GALVIS"). Se vuelve inútil en
# notas dictadas ENTERAS en mayúsculas (texto corrido de UCI/urgencias): ahí
# "paciente", "médico" o un número de 7+ dígitos aparecen cada pocas frases, así
# que casi cualquier frase clínica en mayúsculas "ancla" y se redacta de más.
_ANCLA = re.compile(
    r"\d{7,11}|paciente|autor|especialista|m[eé]dico|dr\.?|dra\.?|nombre|"
    r"atendido|profesional|solicit|\brm\b|tarjeta|c[eé]dula|identidad|nit|"
    r"registro|doctor",
    re.IGNORECASE,
)
# Ventana (caracteres) a cada lado donde se busca el ancla laxa.
_VENTANA = 60

# Cuando el texto alrededor del candidato es en su mayoría mayúsculas corridas
# (nota dictada completa en mayúsculas, no un formulario), la ancla laxa deja de
# discriminar. En ese régimen exigimos en cambio un título pegado inmediatamente
# antes del candidato ("DR ", "DRA ", "DOCTOR(A) ") o una etiqueta con dos puntos
# ("NOMBRE:", "PACIENTE:") — el patrón real de cómo aparece un nombre de persona
# en dictado corrido, a diferencia de una frase clínica cualquiera.
_VENTANA_CORRIDO = 200
_UMBRAL_MAYUS_CORRIDO = 0.6
_ANCLA_ADJUNTA = re.compile(
    r"(?:\bdr\.?|\bdra\.?|\bdoctora?)\s*$|(?:\bnombre|\bpaciente)\s*:\s*$",
    re.IGNORECASE,
)
_VENTANA_ADJUNTA = 15


def _fraccion_mayusculas(texto: str) -> float:
    letras = [c for c in texto if c.isalpha()]
    return sum(1 for c in letras if c.isupper()) / len(letras) if letras else 0.0

# Palabras en mayúscula que NO son nombres: encabezados de sección, términos
# administrativos y clínicos. Si la secuencia contiene alguna, se descarta. La
# comparación es sin tildes y en mayúsculas.
_STOPWORDS = {
    # Encabezados / estructura del documento
    "HISTORIA", "CLINICA", "MOTIVO", "CONSULTA", "ENFERMEDAD", "ACTUAL",
    "ANTECEDENTES", "EXAMEN", "FISICO", "IMPRESION", "DIAGNOSTICA", "DIAGNOSTICO",
    "PLAN", "MANEJO", "TRATAMIENTO", "VALORACION", "NOTA", "EVOLUCION", "ORDEN",
    "FORMULA", "RESUMEN", "ATENCION", "REVISION", "SISTEMAS", "GENERAL", "CONTROL",
    "RECOMENDACIONES", "PROXIMA", "IMPRESION", "OBSERVACIONES", "INTRAMURAL",
    # Datos administrativos / demográficos
    "PERSONAS", "QUE", "NO", "HAN", "DECLARADO", "OCUPACION", "MASCULINO",
    "FEMENINO", "SOLTERO", "CASADO", "UNION", "LIBRE", "VIUDO", "OTRAS", "ETNIAS",
    "VACIO", "APLICA", "NINGUNO", "REFIERE", "NACIONAL", "REGIMEN", "CONTRIBUTIVO",
    "SUBSIDIADO", "SERVICIO", "TIPO", "ESTADO", "CIVIL", "SEXO", "EDAD",
    # Marcas de documento / profesión
    "TARJETA", "IDENTIDAD", "REGISTRO", "DOCUMENTO", "CEDULA", "CIUDADANIA",
    "NIT", "RM", "PACIENTE", "AUTOR", "ESPECIALISTA", "MEDICO", "MEDICINA",
    "ESPECIALIZADA", "PEDIATRA", "NEFROLOGA", "NEFROLOGO", "GENETISTA",
    "ENDOCRINOLOGIA", "PROFESIONAL", "DOCTOR", "DOCTORA",
    # Geografía frecuente (ubicaciones, no nombres)
    "COLOMBIA", "DEPARTAMENTO", "MUNICIPIO", "CESAR", "SANTANDER", "BOGOTA",
    "VEREDA", "BARRIO", "CORREGIMIENTO", "MESA", "MUSICOS", "REGADERO",
    # Instituciones / dependencias
    "HOSPITAL", "FUNDACION", "UNIVERSIDAD", "ENTIDAD", "PROMOTORA", "SALUD",
    "TOTAL", "EPS", "IPS", "CLINICA", "SEDE", "CRUZ", "ROJA", "HUMANA",
    "GENETICA", "NEFROLOGIA", "PEDIATRICA", "PEDIATRICO", "ENDOCRINOLOGIA",
    # Diagnósticos / términos clínicos frecuentes en mayúsculas
    "HIPOFOSFATASIA", "RAQUITISMO", "TRASTORNOS", "DESARROLLO", "SECUELAS",
    "TERAPIA", "REEMPLAZO", "ENZIMATICO", "INTERVENCION", "MEDIDA", "POSESION",
    "PRIMERA", "VEZ", "ADICIONAL", "NIVEL", "BASICA", "PRIMARIA", "SECUNDARIA",
    "TRASTORNO", "INTERCONSULTA", "INTERCONSULTAS", "SOLICITUDES", "SERVICIOS",
    # Pruebas de laboratorio / órdenes
    "FOSFATASA", "ALCALINA", "CALCIO", "IONICO", "FOSFORO", "INORGANICO",
    "CREATININA", "ERITROCITOS", "PROTEINAS", "GASES", "VENOSOS", "HORMONA",
    "ESTIMULANTE", "TIROIDES", "UROANALISIS", "SEDIMENTO", "RADIOGRAFIA",
    "PANORAMICA", "RECUENTO", "DENSIDAD", "URINARIA", "MICROALBUMINURIA",
    "COLORIMETRIA", "ORINA", "SUERO", "AYUNO", "COMIDAS", "HEMATOCRITO",
    "BLAND", "CEMAD", "DIA", "TOMA",
    # FP observados en el corpus real HPP (run 2026-06-19, recognizers/nombre.py).
    # Sin tildes y en MAYÚSCULAS (la comparación normaliza Ñ→N, tildes→base).
    # Encabezados / estructura
    "DATOS", "PERSONALES", "AFILIACION", "DESCRIPCION", "DX", "EXAMENES",
    "SOLICITADOS", "INDICACIONES", "MEDICAS", "NACIMIENTO", "NIEGA", "ALERGIAS",
    "ADMINISTRACION",
    # Datos administrativos / demográficos
    "ESTRATO", "ANOS", "VIDA", "PREVENTIVA", "BIENESTAR", "SOCIAL",
    # Instituciones / dependencias
    "LABORATORIO", "COOPERATIVA", "COMPARTA",
    # Imágenes / diagnósticos / términos clínicos en mayúsculas
    "PEDIATRIA", "CLINICO", "CALCULO", "VEJIGA", "ULTRASONOGRAFIA", "VIAS",
    "URINARIAS", "RINONES", "PROSTATA", "TRANSABDOMINAL", "OSTEODENSITOMETRIA",
    "ABSORCION", "DUAL", "RAYOS",
}


def _sin_tildes(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    )


# El regex de _NOMBRE_MAYUS captura de 2 a 4 palabras en mayúsculas SIN
# distinguir un título/rol al inicio ("DRA YURANY GRUESO GRUESO" se captura
# entero, título incluido). Eso rompe dos cosas: el filtro de _STOPWORDS
# descarta el candidato completo si el título cae en la lista (p. ej.
# "PACIENTE" — ver más abajo), y el ancla estricta de texto corrido busca el
# título ANTES del match, pero aquí quedó DENTRO. Para DR/DRA/DOCTOR(A) el
# título es un ancla inequívoca (casi nunca precede a una frase clínica), así
# que se despega del candidato: no cuenta para el filtro de stopwords y
# satisface el ancla por sí solo. "PACIENTE" se deja fuera a propósito: es
# ambiguo ("PACIENTE HEMODINAMICAMENTE ESTABLE" no es un nombre) y despegarlo
# reabriría ese falso positivo.
_TITULO_PREFIJO = {"DR", "DRA", "DOCTOR", "DOCTORA"}


class ReconocedorNombreMayusculas(PatternRecognizer):
    """
    Detecta nombres de personas escritos EN MAYÚSCULAS (pacientes, médicos),
    el hueco principal de spaCy en historias clínicas reales.

    Acepta secuencias de 2 a 4 palabras en mayúsculas y descarta las que
    contienen encabezados de sección o términos administrativos (vía _STOPWORDS),
    que son la fuente típica de falsos positivos en texto clínico mayúsculas.

    La entidad retornada es NOMBRE_MAYUS; el detector la mapea a "nombres".
    """

    def __init__(self):
        # PatternRecognizer exige al menos un patrón; el filtrado real va en analyze().
        super().__init__(
            supported_entity="NOMBRE_MAYUS",
            patterns=[Pattern(name="nombre_mayusculas", regex=_NOMBRE_MAYUS.pattern, score=0.5)],
            supported_language="es",
        )

    def analyze(self, text, entities, nlp_artifacts=None):
        resultados = []
        for m in _NOMBRE_MAYUS.finditer(text):
            valor = m.group()
            palabras = [_sin_tildes(p).upper() for p in valor.split()]

            titulo_pegado = len(palabras) > 1 and palabras[0] in _TITULO_PREFIJO
            palabras_nombre = palabras[1:] if titulo_pegado else palabras
            if any(p in _STOPWORDS for p in palabras_nombre):
                continue

            if titulo_pegado:
                pass  # el título pegado ya es ancla suficiente, sin importar el régimen del texto
            elif _fraccion_mayusculas(
                text[max(0, m.start() - _VENTANA_CORRIDO):m.start()]
                + text[m.end():m.end() + _VENTANA_CORRIDO]
            ) > _UMBRAL_MAYUS_CORRIDO:
                # Texto corrido en mayúsculas: la ancla laxa no discrimina aquí
                # (ver comentario en _ANCLA). Exigir un título pegado justo antes.
                antes = text[max(0, m.start() - _VENTANA_ADJUNTA):m.start()]
                if not _ANCLA_ADJUNTA.search(antes):
                    continue
            else:
                # Formulario en caja normal con un campo aislado en mayúsculas:
                # basta con una ancla genérica en una ventana amplia.
                entorno = text[max(0, m.start() - _VENTANA):m.start()] + text[m.end():m.end() + _VENTANA]
                if not _ANCLA.search(entorno):
                    continue
            resultados.append(RecognizerResult(
                entity_type="NOMBRE_MAYUS",
                start=m.start(),
                end=m.end(),
                score=0.5,
            ))
        return resultados
