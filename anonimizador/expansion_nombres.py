"""Expansión de nombres parcialmente detectados al nombre completo.

Los reconocedores de nombres (spaCy, gazetteer, MAYÚSCULAS) suelen marcar solo
un pedazo del nombre: "JESSICA" en "PACIENTE JESSICA JURADO MINA VALORADO POR",
o "KEVIN ZAMBRANO" en "DR KEVIN ZAMBRANO OYAGA PEDIATRA". La métrica de
detección lo cuenta como acierto (emparejamiento flexible), pero el reemplazo
solo tapa el pedazo y los apellidos quedan visibles en el PDF: fuga real.

Dos reglas, ambas sobre el texto original:

1. Crecimiento: cada aparición de un nombre detectado se extiende a izquierda y
   derecha sobre las palabras vecinas que "parecen nombre" (inicial mayúscula,
   misma línea, sin puntuación de por medio, no es palabra común ni clínica),
   hasta un máximo de `MAX_TOKENS` palabras.

2. Ancla: tras "PACIENTE", "DR", "DRA"… una racha de palabras con forma de
   nombre es un nombre si tiene 3+ palabras, o 2 con al menos una en el
   gazetteer. Recupera nombres que ningún reconocedor vio ("PACIENTE YURANY
   MAYA MAYA (RECIEN NACIDO"). Ante la duda se prefiere redactar de más.

Los conectores de apellidos compuestos ("DE LA ROSA", "DEL VALLE") se aceptan
dentro del nombre solo si detrás viene otra palabra con forma de nombre.
"""

import re

from spacy.lang.es.stop_words import STOP_WORDS

from .reconocedores.nombre_gazetteer import _normalizar, cargar_nombres

# Un nombre colombiano típico: 1-2 nombres + 2 apellidos.
MAX_TOKENS = 4

# Palabra con forma de nombre: empieza en mayúscula (incluye MAYÚSCULAS corridas).
_PALABRA = r"[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+"
_IZQUIERDA = re.compile(rf"({_PALABRA})[ \t]+$")
_SIGUIENTE = re.compile(rf"[ \t]+({_PALABRA})")
# Con partículas de apellido compuesto en medio ("DE LA ROSA", "del Valle"): solo
# las partículas ignoran mayúsculas; la palabra que sigue debe tener forma de nombre.
_SIGUIENTE_CON_CONECTOR = re.compile(
    rf"[ \t]+(?i:(?:de|del|la|las|los)[ \t]+){{1,2}}({_PALABRA})"
)

# Palabras que suelen ir pegadas a un nombre pero no son parte de él (títulos,
# roles, verbos de la nota). Normalizadas: minúsculas, sin tildes. Las stop words
# de spaCy completan la lista (de, la, por, que, con…).
_NO_NOMBRE = {
    "dr", "dra", "doctor", "doctora", "sr", "sra", "senor", "senora", "lic",
    "paciente", "pte", "madre", "padre", "acudiente", "acompanante", "esposo",
    "esposa", "hijo", "hija", "medico", "medica", "pediatra", "general",
    "residente", "interno", "interna", "especialista", "enfermera", "enfermero",
    "auxiliar", "jefe", "turno", "servicio", "hospital", "clinica", "valorado",
    "valorada", "atendido", "atendida", "identificado", "identificada", "quien",
    "refiere", "presenta", "ingresa", "consulta", "acude", "recien", "nacido",
    "nacida", "masculino", "femenino", "edad", "anos", "sexo", "cc", "ti", "rm",
    "hc", "nota", "firma", "fecha", "cedula", "documento", "registro", "tel",
    "telefono", "direccion", "eps", "ips", "diagnostico", "evolucion", "control",
    "nombre", "nombres", "apellido", "apellidos", "id", "cliente",
}
_ANCLAS = {"paciente", "pte", "dr", "dra", "doctor", "doctora", "sr", "sra",
           "senor", "senora", "madre", "padre", "acudiente"}
_RE_ANCLA = re.compile(
    rf"\b(?:{'|'.join(sorted(_ANCLAS, key=len, reverse=True))})\.?:?[ \t]+",
    re.IGNORECASE,
)

_GAZETTEER = cargar_nombres()


def _puede_ser_nombre(palabra: str) -> bool:
    n = _normalizar(palabra)
    return (
        n not in _NO_NOMBRE and n not in STOP_WORDS and len(n) >= 2
        and not n.endswith("mente")  # adverbios: "HEMODINAMICAMENTE ESTABLE"
    )


def _encaja(palabra: str, en_mayusculas: bool) -> bool:
    """En un nombre en MAYÚSCULAS, la vecina también debe ir en mayúsculas."""
    return _puede_ser_nombre(palabra) and (palabra.isupper() or not en_mayusculas)


def _siguiente(texto: str, pos: int, en_mayusculas: bool) -> re.Match | None:
    """Siguiente palabra-nombre tras `pos` (saltando conectores "DE LA"), o None.
    El match cubre desde `pos` hasta el final de esa palabra."""
    for patron in (_SIGUIENTE, _SIGUIENTE_CON_CONECTOR):
        m = patron.match(texto, pos)
        if m and _encaja(m.group(1), en_mayusculas):
            return m
    return None


def _crecer(texto: str, ini: int, fin: int) -> tuple[int, int]:
    """Extiende [ini, fin) sobre palabras vecinas con forma de nombre."""
    n_tokens = len(texto[ini:fin].split())
    en_mayusculas = texto[ini:fin].isupper()

    while n_tokens < MAX_TOKENS:
        m = _siguiente(texto, fin, en_mayusculas)
        if not m:
            break
        fin, n_tokens = m.end(), n_tokens + 1
    while n_tokens < MAX_TOKENS:
        m = _IZQUIERDA.search(texto[max(0, ini - 40):ini])
        if not m or not _encaja(m.group(1), en_mayusculas):
            break
        ini, n_tokens = ini - (len(m.group(0))), n_tokens + 1
    return ini, fin


def _por_ancla(texto: str) -> set[str]:
    """Nombres tras un ancla: 3+ palabras-nombre, o 2 con alguna en el gazetteer."""
    hallados = set()
    for ancla in _RE_ANCLA.finditer(texto):
        primera = re.compile(_PALABRA).match(texto, ancla.end())
        if not primera or not _puede_ser_nombre(primera.group(0)):
            continue
        palabras, fin = [primera.group(0)], primera.end()
        en_mayusculas = primera.group(0).isupper()
        while len(palabras) < MAX_TOKENS:
            m = _siguiente(texto, fin, en_mayusculas)
            if not m:
                break
            palabras.append(m.group(1))
            fin = m.end()
        en_gazetteer = any(_normalizar(p) in _GAZETTEER for p in palabras)
        if len(palabras) >= 3 or (len(palabras) == 2 and en_gazetteer):
            hallados.add(texto[ancla.end():fin])
    return hallados


# --- Texto en minúsculas (exports sin mayúsculas) ---------------------------
# Sin la inicial mayúscula como pista, una vecina cuenta como parte del nombre si
# es un nombre/apellido del gazetteer; y una sola palabra desconocida al final,
# si justo después viene un límite inequívoco de nombre ("… chindoy cc 107…",
# "… uriana celular 31…", "… guegia, de 19 anos").
_PALABRA_MIN = r"[a-zñáéíóúü]+"
_SIG_MIN = re.compile(rf"[ \t]+((?:(?:de|del|la|las|los)[ \t]+){{0,2}})({_PALABRA_MIN})")
_ANT_MIN = re.compile(rf"({_PALABRA_MIN})[ \t]+$")
_LIMITE_NOMBRE = re.compile(
    r"[ \t]*(?:[,.;:()]|\n|$|(?:cc|c\.c|ti|t\.i|rc|cedula|documento|identificad[oa]|celular|cel|tel|"
    r"telefono|registro|quien|de \d+ anos|\(?(?:madre|padre|abuela|abuelo|tia|tio|hermana|hermano|acudiente)\)?)\b)"
)


def _es_nombre_min(palabra: str) -> bool:
    n = _normalizar(palabra)
    return n in _GAZETTEER and _puede_ser_nombre(palabra)


def _crecer_minusculas(texto: str, ini: int, fin: int) -> tuple[int, int]:
    n_tokens = len(texto[ini:fin].split())
    desconocida_usada = False
    while n_tokens < MAX_TOKENS + 1:
        m = _SIG_MIN.match(texto, fin)
        if not m:
            break
        palabra = m.group(2)
        if _es_nombre_min(palabra):
            fin, n_tokens = m.end(), n_tokens + 1
            continue
        if (not desconocida_usada and not m.group(1) and _puede_ser_nombre(palabra) and len(palabra) >= 3
                and _LIMITE_NOMBRE.match(texto, m.end())):
            fin, n_tokens, desconocida_usada = m.end(), n_tokens + 1, True
            continue
        break
    while n_tokens < MAX_TOKENS + 1:
        m = _ANT_MIN.search(texto[max(0, ini - 40):ini])
        if not m or not _es_nombre_min(m.group(1)):
            break
        ini, n_tokens = ini - len(m.group(0)), n_tokens + 1
    return ini, fin


def expandir_nombres(texto: str, nombres: set[str]) -> set[str]:
    """Devuelve `nombres` más sus versiones completas encontradas en `texto`."""
    resultado = set(nombres)
    for valor in nombres:
        crecer = _crecer_minusculas if valor.islower() else _crecer
        for m in re.finditer(re.escape(valor), texto):
            ini, fin = crecer(texto, m.start(), m.end())
            if (ini, fin) != (m.start(), m.end()):
                resultado.add(texto[ini:fin])
    resultado |= _por_ancla(texto)
    return resultado
