import pytest

from anonimizador.lote import Anonimizador


@pytest.fixture(scope="session")
def anonimizador():
    """Carga spaCy una sola vez para toda la sesión de pruebas."""
    return Anonimizador()
