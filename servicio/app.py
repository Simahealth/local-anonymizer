"""Servicio HTTP del motor de anonimización, para la plataforma SimaHealth.

Envuelve el mismo motor de la app de escritorio (`anonimizador/`, sin cambios)
en dos rutas sin estado:

    POST /analyze   PDF → texto extraído, páginas y tramos detectados
    POST /apply     PDF + tramos finales (revisados por el médico) → PDF anonimizado

El flujo es el del visor de revisión de escritorio: el backend de la plataforma
pide el análisis, el médico corrige los tramos en el navegador y el backend pide
el PDF final con los tramos corregidos. Entre una llamada y otra no se guarda
nada: `/apply` vuelve a extraer el texto del mismo PDF (la extracción es
determinista) y verifica con `sha256` que sea exactamente el texto que se revisó,
así los offsets significan lo mismo.

Reglas:

* Sin persistencia: el PDF se escribe en un directorio temporal solo mientras
  dura la petición (el extractor y el generador trabajan con rutas) y se borra
  al responder.
* Nunca se registra texto del documento: los errores se registran por clase de
  excepción, sin mensaje ni traza.
* Solo red interna (sin puerto publicado en el compose) y, además, un secreto
  compartido en la cabecera `X-Anonimizador-Token`.
* Offsets en unidades UTF-16 (las de JavaScript), como el visor de escritorio.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

from anonimizador.detector import ETIQUETAS_PII
from anonimizador.extractor import SALTO_PAGINA
from anonimizador.generador_pdf import GeneradorPDF
from anonimizador.lote import Anonimizador, ErrorDocumento, desde_utf16, mapa_utf16
from anonimizador.reemplazador import Tramo, aplicar

log = logging.getLogger("anonimizador.servicio")

MB = 1024 * 1024
MAX_BYTES = int(os.environ.get("ANONIMIZADOR_MAX_MB", "15")) * MB
MAX_PAGINAS = int(os.environ.get("ANONIMIZADOR_MAX_PAGINAS", "300"))
MAX_CARACTERES = int(os.environ.get("ANONIMIZADOR_MAX_CARACTERES", "400000"))
# spaCy usa del orden de ~10 KB de RAM por carácter analizado a la vez (ver
# memoria.py): fragmentos de 20 000 caracteres mantienen el pico en ~200 MB.
TAMANO_FRAGMENTO = int(os.environ.get("ANONIMIZADOR_FRAGMENTO", "20000"))
# El vocabulario de spaCy (StringStore) crece con cada palabra nueva y nunca se
# libera: se recarga el modelo cada tantos análisis.
RECARGAR_CADA = int(os.environ.get("ANONIMIZADOR_RECARGAR_CADA", "300"))
# Una petición espera a lo sumo esto a que termine la anterior (un análisis a la vez).
ESPERA_TURNO_S = float(os.environ.get("ANONIMIZADOR_ESPERA_S", "60"))
NOMBRE_SALIDA = "documento-anonimizado"


class _Motor:
    """Un único Anonimizador, cargado al arrancar y usado de a una petición."""

    def __init__(self) -> None:
        self.anonimizador = Anonimizador()
        self.turno = threading.Lock()
        self.usos = 0

    def tramos(self, texto: str) -> list[Tramo]:
        if not self.turno.acquire(timeout=ESPERA_TURNO_S):
            raise HTTPException(status_code=503, detail="El anonimizador está ocupado; intenta de nuevo.")
        try:
            self.usos += 1
            if self.usos % RECARGAR_CADA == 0:
                self.anonimizador.recargar()
            return self.anonimizador.detectar_tramos(texto, TAMANO_FRAGMENTO)
        finally:
            self.turno.release()


_motor: _Motor | None = None


@asynccontextmanager
async def _ciclo(app: FastAPI):
    global _motor
    if not os.environ.get("ANONIMIZADOR_TOKEN"):
        raise RuntimeError("Falta ANONIMIZADOR_TOKEN: el servicio no arranca sin secreto compartido.")
    _motor = _Motor()
    log.info("Modelo cargado (modelo de nombres: %s)", _motor.anonimizador.modelo_nombres_disponible)
    yield
    _motor = None


app = FastAPI(title="SIMA Anonimizador", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_ciclo)


def _autorizado(x_anonimizador_token: str | None = Header(default=None)) -> None:
    esperado = os.environ.get("ANONIMIZADOR_TOKEN", "")
    if not esperado or not x_anonimizador_token or not hmac.compare_digest(x_anonimizador_token, esperado):
        raise HTTPException(status_code=401, detail="No autorizado.")


@app.exception_handler(Exception)
async def _error_inesperado(_request, exc: Exception):
    # Nunca el mensaje ni la traza: podrían contener texto del documento.
    log.error("Error inesperado: %s", exc.__class__.__name__)
    return JSONResponse(status_code=500, content={"detail": "Error interno del anonimizador."})


@app.get("/health")
def health() -> dict:
    return {"ok": _motor is not None}


def _leer_pdf(archivo: UploadFile) -> bytes:
    datos = archivo.file.read(MAX_BYTES + 1)
    if not datos:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")
    if len(datos) > MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"El PDF supera el máximo de {MAX_BYTES // MB} MB.")
    if not datos.lstrip()[:5] == b"%PDF-":
        raise HTTPException(status_code=415, detail="Solo se pueden anonimizar archivos PDF.")
    return datos


def _extraer(datos: bytes) -> str:
    """Texto del PDF con el mismo extractor de escritorio, desde un temporal."""
    with tempfile.TemporaryDirectory(prefix="anon-") as tmp:
        ruta = Path(tmp) / "entrada.pdf"
        ruta.write_bytes(datos)
        try:
            texto = _motor.anonimizador.extraer(ruta)
        except ErrorDocumento as e:
            raise HTTPException(status_code=422, detail=str(e)) from None
    if texto.count(SALTO_PAGINA) + 1 > MAX_PAGINAS:
        raise HTTPException(status_code=413, detail=f"El PDF supera el máximo de {MAX_PAGINAS} páginas.")
    if len(texto) > MAX_CARACTERES:
        raise HTTPException(status_code=413, detail="El PDF tiene demasiado texto para anonimizarlo aquí.")
    return texto


def _huella(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _paginas(texto: str) -> list[tuple[int, int]]:
    """[inicio, fin) de cada página en code points (separadas por SALTO_PAGINA)."""
    paginas, inicio = [], 0
    while True:
        salto = texto.find(SALTO_PAGINA, inicio)
        paginas.append((inicio, len(texto) if salto == -1 else salto))
        if salto == -1:
            return paginas
        inicio = salto + 1


@app.post("/analyze", dependencies=[Depends(_autorizado)])
def analyze(file: UploadFile = File(...)) -> dict:
    texto = _extraer(_leer_pdf(file))
    tramos = _motor.tramos(texto)
    a_js = mapa_utf16(texto)
    return {
        "text": texto,
        "sha256": _huella(texto),
        "pages": [{"number": n, "start": a_js(a), "end": a_js(b)} for n, (a, b) in enumerate(_paginas(texto), 1)],
        "spans": [{"start": a_js(t.inicio), "end": a_js(t.fin), "category": t.categoria} for t in tramos],
        "labels": ETIQUETAS_PII,
    }


def _tramos_finales(texto: str, crudo: str) -> list[Tramo]:
    """Valida los tramos que manda el cliente (UTF-16) y los fusiona si se solapan."""
    try:
        lista = json.loads(crudo)
        assert isinstance(lista, list)
        pedidos = [(int(s["start"]), int(s["end"]), str(s["category"])) for s in lista]
    except Exception:  # noqa: BLE001 -- cualquier forma inválida es el mismo 422
        raise HTTPException(status_code=422, detail="spans no es una lista válida de tramos.") from None
    largo_js = mapa_utf16(texto)(len(texto))
    tramos = []
    for inicio, fin, categoria in pedidos:
        if categoria not in ETIQUETAS_PII or not 0 <= inicio < fin <= largo_js:
            raise HTTPException(status_code=422, detail="Tramo fuera del texto o con categoría desconocida.")
        tramos.append(Tramo(desde_utf16(texto, inicio), desde_utf16(texto, fin), categoria))
    fusionados: list[Tramo] = []
    for t in sorted(tramos):
        if fusionados and t.inicio < fusionados[-1].fin:
            previo = fusionados[-1]
            fusionados[-1] = Tramo(previo.inicio, max(previo.fin, t.fin), previo.categoria)
        else:
            fusionados.append(t)
    return fusionados


@app.post("/apply", dependencies=[Depends(_autorizado)])
def apply(file: UploadFile = File(...), spans: str = Form(...), sha256: str = Form(...)) -> Response:
    texto = _extraer(_leer_pdf(file))
    if not hmac.compare_digest(_huella(texto), sha256):
        raise HTTPException(status_code=409, detail="El documento no coincide con el que se revisó.")
    anonimizado = aplicar(texto, _tramos_finales(texto, spans))
    with tempfile.TemporaryDirectory(prefix="anon-") as tmp:
        pdf = GeneradorPDF(Path(tmp)).generar(NOMBRE_SALIDA, anonimizado).read_bytes()
    return Response(content=pdf, media_type="application/pdf")
