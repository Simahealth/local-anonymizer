import re
import unicodedata
from pathlib import Path

from presidio_analyzer import EntityRecognizer, RecognizerResult

# Lista de nombres/apellidos. Una entrada por línea; ver data/nombres_co.txt.
RUTA_NOMBRES = Path(__file__).parent.parent / "datos" / "nombres_co.txt"

# Tokens-palabra (letras con tildes/Ñ). Sobre estos se buscan los nombres.
_TOKEN = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+")

# Ancla de contexto de NOMBRE: marca quién es la persona. Solo se exige para
# tokens sueltos (un nombre de una sola palabra); las secuencias de 2+ ya son
# suficientemente específicas.
_ANCLA = re.compile(
    r"paciente|acompa|madre|padre|mam[aá]|pap[aá]|hij[oa]|abuel|herman|"
    r"\bdr\b|\bdra\b|doctor|doctora|m[eé]dico|especialista|enfermer|"
    r"nombre|se[nñ]or|\bsra\b|\bsr\b|identificad|atendi",
    re.IGNORECASE,
)
_VENTANA = 40  # caracteres a cada lado donde se busca el ancla

# Tokens que están en la lista pero en texto clínico aparecen sobre todo como
# palabra común o marca institucional. Se ignoran (defensa extra; idealmente la
# lista ya no los trae). Normalizados (minúsculas, sin tildes).
_STOP = {
    "salud", "cruz", "paz", "santa", "san", "mayor", "control", "general",
    "nueva", "total", "dolores", "rosa", "vera", "leon", "varon", "salas",
}


def _sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _normalizar(s: str) -> str:
    return _sin_tildes(s.lower())


def cargar_nombres(ruta: Path = RUTA_NOMBRES) -> set[str]:
    """Lee el gazetteer a un set de tokens normalizados (minúsculas, sin tildes)."""
    if not ruta.exists():
        return set()
    nombres = set()
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        for tok in linea.split():
            n = _normalizar(tok)
            if n:
                nombres.add(n)
    return nombres


class ReconocedorNombreGazetteer(EntityRecognizer):
    """
    Detecta nombres de personas por diccionario (gazetteer) de nombres y
    apellidos colombianos. Complementa a spaCy: es insensible a mayúsculas y
    tildes, así que recupera nombres en minúscula de historias clínicas escaneadas
    ("diana herrera", "laura rodriguez montoya") que spaCy y el reconocedor de
    MAYÚSCULAS no ven; y al exigir que el token SEA un nombre conocido, no marca
    términos clínicos ("gastroenteritis", "ivu", "valsalva").

    Regla: una secuencia de 2+ tokens-nombre consecutivos es un nombre. Un token
    suelto solo cuenta si tiene un ancla de persona cerca (paciente, madre, dr…).

    La entidad retornada es NOMBRE_GAZETTEER; el detector la mapea a "nombres".
    """

    ENTIDAD = "NOMBRE_GAZETTEER"

    def __init__(self):
        super().__init__(
            supported_entities=[self.ENTIDAD],
            supported_language="es",
            name="ReconocedorNombreGazetteer",
        )
        self._nombres = cargar_nombres()

    def load(self) -> None:  # requerido por EntityRecognizer
        pass

    def analyze(self, text, entities, nlp_artifacts=None):
        if not self._nombres:
            return []
        toks = [(m.start(), m.end()) for m in _TOKEN.finditer(text)]
        es_nombre = []
        for ini, fin in toks:
            n = _normalizar(text[ini:fin])
            es_nombre.append(n in self._nombres and n not in _STOP)

        resultados = []
        i = 0
        while i < len(toks):
            if not es_nombre[i]:
                i += 1
                continue
            j = i
            while j < len(toks) and es_nombre[j]:
                j += 1
            ini, fin = toks[i][0], toks[j - 1][1]
            longitud = j - i
            if longitud >= 2:
                resultados.append(RecognizerResult(self.ENTIDAD, ini, fin, 0.6))
            else:
                entorno = text[max(0, ini - _VENTANA):ini] + text[fin:fin + _VENTANA]
                if _ANCLA.search(entorno):
                    resultados.append(RecognizerResult(self.ENTIDAD, ini, fin, 0.55))
            i = j
        return resultados
