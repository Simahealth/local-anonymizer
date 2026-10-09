"""Regresión de privacidad: 0 fugas de PII en los conjuntos colombianos.

Corre el pipeline completo (extracción → detección → reemplazo) y busca cada
valor del ground truth en el texto final. Ver tests/evaluacion/fugas.py.
"""
from pathlib import Path

import pytest

from anonimizador.detector import DetectorPII
from anonimizador.extractor import ExtractorPDF
from anonimizador.reemplazador import Reemplazador
from tests.evaluacion.fugas import fugas_caso
from tests.evaluacion.metricas import cargar_casos

EVAL = Path(__file__).parent / "evaluacion"


@pytest.fixture(scope="module")
def pipeline():
    return DetectorPII(), Reemplazador()


@pytest.mark.parametrize("dataset", ["datos", "datos_sintetico_co", "datos_sintetico_ame"])
def test_sin_fugas_en_textos(pipeline, dataset):
    fugas = [
        (c["nombre"], *f)
        for c in cargar_casos(dir_datos=EVAL / dataset)
        for f in fugas_caso(c, *pipeline)
    ]
    assert fugas == []


def test_sin_fugas_en_pdfs(pipeline):
    extractor = ExtractorPDF()
    fugas = []
    for caso in cargar_casos(dir_datos=EVAL / "datos_sintetico_ame"):
        texto = extractor.extraer(EVAL / "pdfs_sintetico_ame" / f"{caso['nombre']}.pdf")
        fugas += [(caso["nombre"], *f) for f in fugas_caso(caso, *pipeline, texto)]
    assert fugas == []
