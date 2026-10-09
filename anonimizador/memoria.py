"""Uso de memoria adaptado al equipo, para lotes de decenas de miles de documentos.

Tres mecanismos:

* Fragmentos: spaCy necesita del orden de ~10 KB de RAM por carácter que
  analiza a la vez (tokens, vectores, NER), y rechaza textos de más de 1 millón
  de caracteres. Los documentos largos se analizan por fragmentos cuyo tamaño
  depende de la memoria disponible en ese momento.

* Espera: si la memoria libre del sistema cae por debajo de `MINIMO_LIBRE`
  (otras apps abiertas, equipo modesto), el lote espera antes del siguiente
  documento en vez de forzar al sistema a paginar.

* Reciclaje: el vocabulario interno de spaCy (StringStore) crece con cada
  palabra nueva que ve y nunca se libera; en lotes de 50 000 historias el
  proceso crece sin parar. Cuando el proceso supera su presupuesto de memoria
  (o cada `RECICLAR_CADA` documentos) se descarta el modelo y se vuelve a
  cargar (~1 s).
"""

import gc
import time
from dataclasses import dataclass
from typing import Callable

import psutil

MB = 1024 * 1024
GB = 1024 * MB

BYTES_POR_CARACTER = 10 * 1024
FRAGMENTO_MIN = 20_000
FRAGMENTO_MAX = 200_000
MINIMO_LIBRE = 500 * MB
RECICLAR_CADA = 5_000


@dataclass
class EstadoMemoria:
    disponible: int
    total: int
    proceso: int
    fragmento: int
    esperando: bool

    def a_dict(self) -> dict:
        return {
            "disponibleMb": self.disponible // MB,
            "totalMb": self.total // MB,
            "procesoMb": self.proceso // MB,
            "fragmento": self.fragmento,
            "esperando": self.esperando,
        }


class GestorMemoria:
    def __init__(self):
        self._proceso = psutil.Process()
        self._total = psutil.virtual_memory().total
        # Presupuesto de crecimiento del proceso por encima de lo que ocupaba con
        # el modelo recién cargado: 1/4 de la RAM, entre 1 y 4 GB.
        self.presupuesto = min(max(self._total // 4, 1 * GB), 4 * GB)
        self._base = self._rss()
        self._desde_reciclaje = 0
        self.esperando = False

    def _rss(self) -> int:
        return self._proceso.memory_info().rss

    def tamano_fragmento(self) -> int:
        """Caracteres a analizar de una vez según la memoria libre ahora."""
        disponible = psutil.virtual_memory().available
        return max(FRAGMENTO_MIN, min(FRAGMENTO_MAX, disponible // 2 // BYTES_POR_CARACTER))

    def esperar_memoria(self, cancelado: Callable[[], bool], pausa: float = 2.0) -> None:
        """Bloquea mientras la memoria libre del sistema esté por debajo del mínimo."""
        while psutil.virtual_memory().available < MINIMO_LIBRE and not cancelado():
            self.esperando = True
            gc.collect()
            time.sleep(pausa)
        self.esperando = False

    def documento_procesado(self) -> None:
        self._desde_reciclaje += 1

    def debe_reciclar(self) -> bool:
        return (
            self._desde_reciclaje >= RECICLAR_CADA
            or self._rss() - self._base > self.presupuesto
        )

    def reciclado(self) -> None:
        """Llamar tras descartar y recargar el modelo."""
        gc.collect()
        self._base = self._rss()
        self._desde_reciclaje = 0

    def estado(self) -> EstadoMemoria:
        return EstadoMemoria(
            disponible=psutil.virtual_memory().available,
            total=self._total,
            proceso=self._rss(),
            fragmento=self.tamano_fragmento(),
            esperando=self.esperando,
        )


def fragmentar(texto: str, tamano: int) -> list[tuple[int, str]]:
    """Parte `texto` en fragmentos de hasta `tamano` caracteres, cortando en un
    salto de línea (o espacio) para no partir palabras ni, en lo posible,
    renglones. Devuelve (offset, fragmento)."""
    fragmentos, inicio = [], 0
    while inicio < len(texto):
        fin = min(inicio + tamano, len(texto))
        if fin < len(texto):
            corte = texto.rfind("\n", inicio + tamano // 2, fin)
            if corte == -1:
                corte = texto.rfind(" ", inicio + tamano // 2, fin)
            if corte != -1:
                fin = corte + 1
        fragmentos.append((inicio, texto[inicio:fin]))
        inicio = fin
    return fragmentos
