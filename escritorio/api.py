"""API que la interfaz (React) llama vía `window.pywebview.api.<método>`.

Cada método público de `ApiEscritorio` queda expuesto a JavaScript. pywebview
recorre también los atributos públicos del objeto, así que todo el estado
interno va en atributos con `_` (los ignora).

Pensada para lotes de hasta decenas de miles de documentos:

* La selección de archivos vive en Python; la interfaz solo recibe totales y
  páginas de la lista (nunca 50 000 rutas de una vez).
* El lote corre en un hilo aparte y su estado se persiste en `lote.sqlite`; la
  interfaz consulta un resumen agregado (`estado_lote`) cada medio segundo.
* La revisión pide los documentos de a una página (`documentos`) y el detalle de
  uno solo a la vez (`documento`).
"""

import json
import os
import platform
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

from anonimizador.almacen import FILTROS, Almacen
from anonimizador.lote import Anonimizador, EventoDocumento, Lote, desde_utf16
from anonimizador.memoria import GestorMemoria

NOMBRE_APP = "SIMA Anonimizador"
VERSION = "1.3.0"
LIMITE_PAGINA = 200


def carpeta_datos_app() -> Path:
    """Carpeta de configuración del usuario (registro de lotes).
    `SIMA_ANONIMIZADOR_DATOS` la redirige (pruebas, instalaciones portables)."""
    if os.environ.get("SIMA_ANONIMIZADOR_DATOS"):
        base = Path(os.environ["SIMA_ANONIMIZADOR_DATOS"])
        base.mkdir(parents=True, exist_ok=True)
        return base
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    carpeta = base / NOMBRE_APP
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta


def iterar_pdfs(rutas: list[str]):
    """Expande carpetas (recursivo) y filtra a PDF. Genera (ruta, tamaño)."""
    for r in rutas:
        p = Path(r)
        if p.is_dir():
            for x in sorted(p.rglob("*")):
                if x.suffix.lower() == ".pdf" and x.is_file() and not x.name.startswith("._"):
                    yield str(x), x.stat().st_size
        elif p.is_file() and p.suffix.lower() == ".pdf":
            yield str(p), p.stat().st_size


def pdfs_en(rutas: list[str]) -> list[dict]:
    """[{ruta, nombre, tamano}] de los PDF en `rutas` (archivos y carpetas)."""
    return [{"ruta": r, "nombre": Path(r).name, "tamano": t} for r, t in iterar_pdfs(rutas)]


class ApiEscritorio:
    def __init__(self):
        self._anonimizador: Anonimizador | None = None
        self._error_motor: str | None = None
        self._memoria: GestorMemoria | None = None

        # Selección pendiente de lote: ruta → tamaño (dict: conserva el orden).
        self._seleccion: dict[str, int] = {}
        self._candado_seleccion = threading.Lock()

        self._lote: Lote | None = None
        self._hilo: threading.Thread | None = None
        self._pausar = threading.Event()
        self._candado = threading.Lock()
        self._actual: dict | None = None
        self._recientes: deque[dict] = deque(maxlen=8)
        self._tiempos: deque[float] = deque(maxlen=200)  # para velocidad y tiempo restante

        self._lotes: dict[str, Lote] = {}  # lotes abiertos para revisión
        self._ruta_registro = carpeta_datos_app() / "lotes.json"
        threading.Thread(target=self._cargar_motor, daemon=True).start()

    # ------------------------------------------------------------------ #
    # Motor
    # ------------------------------------------------------------------ #

    def _cargar_motor(self) -> None:
        try:
            self._memoria = GestorMemoria()
            self._anonimizador = Anonimizador()
            self._memoria.reciclado()  # línea base de memoria con el modelo cargado
        except Exception as e:  # noqa: BLE001 — se muestra en la interfaz
            self._error_motor = f"{e.__class__.__name__}: {e}"

    def estado_motor(self) -> dict:
        return {
            "listo": self._anonimizador is not None,
            "error": self._error_motor,
            # Sin el modelo, los nombres que no estén en el gazetteer se escapan.
            "modeloNombres": bool(self._anonimizador and self._anonimizador.modelo_nombres_disponible),
        }

    def info(self) -> dict:
        return {"version": VERSION, "plataforma": platform.system()}

    # ------------------------------------------------------------------ #
    # Selección de documentos
    # ------------------------------------------------------------------ #

    def agregar_rutas(self, rutas: list[str]) -> dict:
        agregados = repetidos = 0
        with self._candado_seleccion:
            for ruta, tamano in iterar_pdfs(rutas):
                if ruta in self._seleccion:
                    repetidos += 1
                else:
                    self._seleccion[ruta] = tamano
                    agregados += 1
        return {**self._resumen_seleccion(), "agregados": agregados, "repetidos": repetidos}

    def seleccionar_archivos(self) -> dict:
        import webview

        rutas = webview.windows[0].create_file_dialog(
            webview.FileDialog.OPEN, allow_multiple=True,
            file_types=("Documentos PDF (*.pdf;*.PDF)",),
        )
        return self.agregar_rutas(list(rutas or []))

    def seleccionar_carpeta_origen(self) -> dict:
        import webview

        rutas = webview.windows[0].create_file_dialog(webview.FileDialog.FOLDER)
        return self.agregar_rutas(list(rutas or []))

    def _resumen_seleccion(self) -> dict:
        return {"total": len(self._seleccion), "tamano": sum(self._seleccion.values())}

    def seleccion(self, offset: int = 0, limite: int = 100) -> dict:
        limite = min(limite, LIMITE_PAGINA)
        with self._candado_seleccion:
            items = list(self._seleccion.items())[offset:offset + limite]
        return {
            **self._resumen_seleccion(),
            "archivos": [{"ruta": r, "nombre": Path(r).name, "tamano": t} for r, t in items],
        }

    def quitar_de_seleccion(self, ruta: str) -> dict:
        with self._candado_seleccion:
            self._seleccion.pop(ruta, None)
        return self._resumen_seleccion()

    def limpiar_seleccion(self) -> dict:
        with self._candado_seleccion:
            self._seleccion.clear()
        return self._resumen_seleccion()

    # ------------------------------------------------------------------ #
    # Carpetas
    # ------------------------------------------------------------------ #

    def seleccionar_carpeta(self, actual: str = "") -> str | None:
        import webview

        rutas = webview.windows[0].create_file_dialog(webview.FileDialog.FOLDER, directory=actual or "")
        return rutas[0] if rutas else None

    def carpeta_predeterminada(self) -> str:
        documentos = Path.home() / "Documents"
        return str((documentos if documentos.exists() else Path.home()) / NOMBRE_APP)

    def abrir_ruta(self, ruta: str) -> bool:
        """Abre una carpeta o archivo con la aplicación del sistema."""
        if not Path(ruta).exists():
            return False
        if sys.platform == "darwin":
            subprocess.Popen(["open", ruta])
        elif sys.platform == "win32":
            os.startfile(ruta)  # noqa: S606
        else:
            subprocess.Popen(["xdg-open", ruta])
        return True

    # ------------------------------------------------------------------ #
    # Lote en proceso
    # ------------------------------------------------------------------ #

    def iniciar_lote(self, carpeta_destino: str) -> dict:
        with self._candado_seleccion:
            rutas = list(self._seleccion)
        if not rutas:
            return {"ok": False, "error": "No hay documentos para procesar."}
        try:
            Path(carpeta_destino).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            return {"ok": False, "error": f"No se pudo usar la carpeta de destino: {e}"}
        if self._ocupado():
            return {"ok": False, "error": "Ya hay un lote en proceso."}

        lote = Lote.crear(rutas, carpeta_destino)
        self._registrar(lote)
        self.limpiar_seleccion()
        return self._arrancar(lote)

    def reanudar_lote(self, carpeta: str) -> dict:
        if self._ocupado():
            return {"ok": False, "error": "Ya hay un lote en proceso."}
        try:
            lote = self._lote_en(carpeta)
        except FileNotFoundError as e:
            return {"ok": False, "error": str(e)}
        return self._arrancar(lote)

    def _ocupado(self) -> bool:
        return bool(self._hilo and self._hilo.is_alive())

    def _arrancar(self, lote: Lote) -> dict:
        with self._candado:
            if self._anonimizador is None:
                return {"ok": False, "error": "El motor de anonimización aún no está listo."}
            if self._ocupado():
                return {"ok": False, "error": "Ya hay un lote en proceso."}
            self._pausar.clear()
            self._lote, self._actual = lote, None
            self._recientes.clear()
            self._tiempos.clear()
            self._hilo = threading.Thread(target=self._procesar, args=(lote,), daemon=True)
            self._hilo.start()
        return {"ok": True, "carpeta": str(lote.carpeta)}

    def _procesar(self, lote: Lote) -> None:
        def al_avanzar(evento: EventoDocumento) -> None:
            if evento.estado == "procesando":
                self._actual = evento.a_dict()
            else:
                self._actual = None
                self._recientes.appendleft(evento.a_dict())
                self._tiempos.append(time.monotonic())

        lote.procesar(self._anonimizador, al_avanzar, self._pausar.is_set, self._memoria)

    def pausar_lote(self) -> None:
        """Detiene el lote tras el documento en curso; queda listo para reanudar."""
        self._pausar.set()

    def estado_lote(self) -> dict | None:
        lote = self._lote
        if lote is None:
            return None
        activo = self._ocupado()
        contadores = lote.almacen.contadores()
        velocidad = restante = None
        if len(self._tiempos) >= 2:
            lapso = self._tiempos[-1] - self._tiempos[0]
            if lapso > 0:
                por_seg = (len(self._tiempos) - 1) / lapso
                velocidad = round(por_seg * 60, 1)
                restante = round(contadores["pendientes"] / por_seg) if activo else None
        return {
            "carpeta": str(lote.carpeta),
            "carpetaPdfs": str(lote.carpeta_pdfs),
            "relacionXlsx": str(lote.carpeta / "relacion_codigos.xlsx"),
            "activo": activo,
            "pausando": activo and self._pausar.is_set(),
            "contadores": contadores,
            "actual": self._actual if activo else None,
            "recientes": list(self._recientes),
            "porMinuto": velocidad,
            "segundosRestantes": restante,
            "memoria": self._memoria.estado().a_dict() if self._memoria else None,
        }

    # ------------------------------------------------------------------ #
    # Revisión
    # ------------------------------------------------------------------ #

    def _lote_en(self, carpeta: str) -> Lote:
        carpeta = str(Path(carpeta))
        if self._lote and str(self._lote.carpeta) == carpeta:
            return self._lote
        if carpeta not in self._lotes:
            self._lotes[carpeta] = Lote.abrir(carpeta)
        return self._lotes[carpeta]

    def abrir_lote(self, carpeta: str) -> dict:
        lote = self._lote_en(carpeta)
        return {
            "carpeta": str(lote.carpeta),
            "creado": lote.almacen.meta("creado"),
            "contadores": lote.almacen.contadores(),
            "procesando": self._ocupado() and self._lote is lote,
        }

    def documentos(self, carpeta: str, offset: int = 0, limite: int = 100,
                   filtro: str = "todos", busqueda: str = "") -> dict:
        if filtro not in FILTROS:
            filtro = "todos"
        total, filas = self._lote_en(carpeta).almacen.listar(
            offset, min(limite, LIMITE_PAGINA), filtro, busqueda
        )
        return {
            "total": total,
            "documentos": [
                {"codigo": f["codigo"], "nombreOriginal": f["nombre_original"],
                 "estado": f["estado"], "totalPii": f["total_pii"], "revisado": bool(f["revisado"]),
                 "paginas": f["paginas"], "error": f["error"]}
                for f in filas
            ],
        }

    def documento(self, carpeta: str, codigo: str) -> dict:
        return self._lote_en(carpeta).documento_revision(codigo)

    def ocultar(self, carpeta: str, codigo: str, inicio: int, fin: int,
                categoria: str, todas: bool = False) -> dict:
        """`inicio`/`fin` llegan en unidades UTF-16 (JavaScript)."""
        lote = self._lote_en(carpeta)
        texto = lote.almacen.texto(lote.almacen.documento(codigo)["id"])
        lote.ocultar(codigo, desde_utf16(texto, inicio), desde_utf16(texto, fin), categoria, todas)
        return lote.documento_revision(codigo)

    def actualizar_tramo(self, carpeta: str, codigo: str, tramo_id: int,
                         activo: bool | None = None, categoria: str | None = None) -> dict:
        lote = self._lote_en(carpeta)
        lote.actualizar_tramo(codigo, tramo_id, activo, categoria)
        return lote.documento_revision(codigo)

    def alternar_valor(self, carpeta: str, codigo: str, tramo_id: int, activo: bool) -> dict:
        """Muestra/oculta un tramo y todos los del documento con el mismo texto."""
        lote = self._lote_en(carpeta)
        ids = lote.alternar_valor(codigo, tramo_id, activo)
        return {"ids": ids, "documento": lote.documento_revision(codigo)}

    def fijar_tramos(self, carpeta: str, codigo: str, ids: list[int], activo: bool) -> dict:
        lote = self._lote_en(carpeta)
        lote.fijar_tramos(codigo, ids, activo)
        return lote.documento_revision(codigo)

    def cambiar_categoria(self, carpeta: str, codigo: str, ids: list[int], categoria: str) -> dict:
        lote = self._lote_en(carpeta)
        lote.cambiar_categoria(codigo, ids, categoria)
        return lote.documento_revision(codigo)

    def mostrar_en_lote(self, carpeta: str, valor: str) -> dict:
        return self._lote_en(carpeta).mostrar_en_lote(valor)

    def ocultar_en_lote(self, carpeta: str, valor: str, categoria: str) -> dict:
        return self._lote_en(carpeta).ocultar_en_lote(valor, categoria)

    def marcar_revisado(self, carpeta: str, codigo: str, revisado: bool) -> dict:
        lote = self._lote_en(carpeta)
        lote.marcar_revisado(codigo, revisado)
        return lote.almacen.contadores()

    def exportar_relacion(self, carpeta: str) -> str:
        """Reescribe relacion_codigos.xlsx/.csv con el estado actual (revisados,
        datos ocultados tras las correcciones)."""
        xlsx, _ = self._lote_en(carpeta).escribir_relacion()
        return str(xlsx)

    # ------------------------------------------------------------------ #
    # Registro de lotes (solo carpeta y fecha: nunca nombres ni datos de pacientes)
    # ------------------------------------------------------------------ #

    def _leer_registro(self) -> list[dict]:
        try:
            return json.loads(self._ruta_registro.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []

    def _registrar(self, lote: Lote) -> None:
        registro = [e for e in self._leer_registro() if e.get("carpeta") != str(lote.carpeta)]
        registro.insert(0, {"carpeta": str(lote.carpeta),
                            "creado": datetime.now().isoformat(timespec="seconds")})
        self._ruta_registro.write_text(json.dumps(registro[:500], ensure_ascii=False, indent=2),
                                       encoding="utf-8")

    def historial(self) -> list[dict]:
        lotes = []
        for e in self._leer_registro():
            carpeta = Path(e["carpeta"])
            existe = Almacen.existe(carpeta)
            entrada = {"carpeta": str(carpeta), "creado": e.get("creado", ""), "existe": existe,
                       "procesando": bool(self._lote and self._lote.carpeta == carpeta and self._ocupado())}
            if existe:
                entrada["contadores"] = self._lote_en(str(carpeta)).almacen.contadores()
            lotes.append(entrada)
        return lotes
