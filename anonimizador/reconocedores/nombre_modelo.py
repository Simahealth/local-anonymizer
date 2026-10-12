"""Nombres de persona con el modelo NER entrenado para el export clínico.

Modelo spaCy pequeño (CNN, CPU) entrenado con tests/evaluacion/
entrenar_modelo_nombres.py: reconoce nombres por contexto y por forma de la
palabra, sin depender de que estén en una lista (ver ese módulo). Si el modelo
no está instalado (anonimizador/modelos/nombres), el reconocedor no hace nada.
"""

import re
from pathlib import Path

from presidio_analyzer import EntityRecognizer, RecognizerResult
from spacy.lang.es.stop_words import STOP_WORDS

RUTA_MODELO = Path(__file__).parent.parent / "modelos" / "nombres"
LARGO_FRAGMENTO = 1000  # el modelo se entrenó con fragmentos de ~500 caracteres


def _fragmentos(texto: str):
    """(offset, fragmento) de ~LARGO_FRAGMENTO caracteres, cortando en espacios."""
    inicio = 0
    while inicio < len(texto):
        fin = min(len(texto), inicio + LARGO_FRAGMENTO)
        if fin < len(texto):
            corte = texto.rfind(" ", inicio + LARGO_FRAGMENTO // 2, fin)
            fin = corte if corte > 0 else fin
        yield inicio, texto[inicio:fin]
        inicio = fin


class ReconocedorNombreModelo(EntityRecognizer):
    ENTIDAD = "NOMBRE_MODELO"

    def __init__(self, ruta: Path = RUTA_MODELO):
        self._ruta = ruta
        self._nlp = None
        super().__init__(supported_entities=[self.ENTIDAD], supported_language="es",
                         name="ReconocedorNombreModelo")

    def load(self) -> None:
        if self._ruta.exists():
            import spacy

            self._nlp = spacy.load(self._ruta)

    @property
    def disponible(self) -> bool:
        return self._nlp is not None

    def analyze(self, text, entities, nlp_artifacts=None):
        if self._nlp is None:
            return []
        trozos = list(_fragmentos(text))
        resultados = []
        for (offset, _), doc in zip(trozos, self._nlp.pipe(t for _, t in trozos)):
            for ent in doc.ents:
                palabras = re.findall(r"[^\W\d_]+", ent.text.lower())
                if not palabras or all(p in STOP_WORDS or len(p) < 3 for p in palabras):
                    continue
                resultados.append(RecognizerResult(
                    self.ENTIDAD, offset + ent.start_char, offset + ent.end_char, 0.75))
        return resultados
