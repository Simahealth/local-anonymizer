"""API que la interfaz (React) llama vía `window.pywebview.api.<método>`.

Cada método público de `ApiEscritorio` queda expuesto a JavaScript. pywebview
recorre también los atributos públicos del objeto, así que todo el estado
interno va en atributos con `_` (los ignora).

El lote corre en un hilo aparte; la interfaz consulta su avance con
`estado_lote()` cada pocos cientos de milisegundos.
"""

import json
import os
import platform
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path

from anonimizador.lote import Anonimizador, Lote

NOMBRE_APP = "SIMA Anonimizador"
VERSION = "1.0.0"


def carpeta_datos_app() -> Path:
    """Carpeta de configuración del usuario (historial de lotes).
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


def pdfs_en(rutas: list[str]) -> list[dict]:
    """Expande carpetas y filtra a PDF. Devuelve [{ruta, nombre, tamano}]."""
    encontrados: list[Path] = []
    for r in rutas:
        p = Path(r)
        if p.is_dir():
            encontrados += sorted(x for x in p.rglob("*") if x.is_file() and x.suffix.lower() == ".pdf")
        elif p.is_file() and p.suffix.lower() == ".pdf":
            encontrados.append(p)
    return [{"ruta": str(p), "nombre": p.name, "tamano": p.stat().st_size} for p in encontrados]


class ApiEscritorio:
    def __init__(self):
        self._anonimizador: Anonimizador | None = None
        self._error_motor: str | None = None
        self._lote: Lote | None = None
        self._hilo: threading.Thread | None = None
        self._cancelar = threading.Event()
        self._candado = threading.Lock()
        self._ruta_historial = carpeta_datos_app() / "historial.json"
        threading.Thread(target=self._cargar_motor, daemon=True).start()

    # ------------------------------------------------------------------ #
    # Motor
    # ------------------------------------------------------------------ #

    def _cargar_motor(self) -> None:
        try:
            self._anonimizador = Anonimizador()
        except Exception as e:  # noqa: BLE001 — se muestra en la interfaz
            self._error_motor = f"{e.__class__.__name__}: {e}"

    def estado_motor(self) -> dict:
        return {"listo": self._anonimizador is not None, "error": self._error_motor}

    def info(self) -> dict:
        return {"version": VERSION, "plataforma": platform.system()}

    # ------------------------------------------------------------------ #
    # Archivos y carpetas
    # ------------------------------------------------------------------ #

    def seleccionar_archivos(self) -> list[dict]:
        import webview

        rutas = webview.windows[0].create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=True,
            file_types=("Documentos PDF (*.pdf;*.PDF)",),
        )
        return pdfs_en(list(rutas or []))

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
    # Lote
    # ------------------------------------------------------------------ #

    def iniciar_lote(self, rutas: list[str], carpeta_destino: str) -> dict:
        with self._candado:
            if self._hilo and self._hilo.is_alive():
                return {"ok": False, "error": "Ya hay un lote en proceso."}
            if self._anonimizador is None:
                return {"ok": False, "error": "El motor de anonimización aún no está listo."}
            if not rutas:
                return {"ok": False, "error": "No hay documentos para procesar."}
            try:
                Path(carpeta_destino).mkdir(parents=True, exist_ok=True)
            except OSError as e:
                return {"ok": False, "error": f"No se pudo usar la carpeta de destino: {e}"}

            self._cancelar.clear()
            self._lote = Lote(rutas, carpeta_destino)
            self._hilo = threading.Thread(target=self._procesar, args=(self._lote,), daemon=True)
            self._hilo.start()
            return {"ok": True, "carpeta": str(self._lote.carpeta)}

    def _procesar(self, lote: Lote) -> None:
        lote.procesar(self._anonimizador, cancelado=self._cancelar.is_set)
        self._registrar_historial(lote)

    def cancelar_lote(self) -> None:
        self._cancelar.set()

    def estado_lote(self) -> dict | None:
        lote = self._lote
        if lote is None:
            return None
        activo = bool(self._hilo and self._hilo.is_alive())
        return {
            "activo": activo,
            "cancelado": self._cancelar.is_set(),
            "carpeta": str(lote.carpeta),
            "carpetaPdfs": str(lote.carpeta_pdfs),
            "relacionXlsx": str(lote.carpeta / "relacion_codigos.xlsx"),
            "documentos": [d.a_dict() for d in lote.documentos],
        }

    # ------------------------------------------------------------------ #
    # Historial (solo totales y la carpeta: nunca nombres de archivo ni PII)
    # ------------------------------------------------------------------ #

    def historial(self) -> list[dict]:
        try:
            datos = json.loads(self._ruta_historial.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        for lote in datos:
            lote["existe"] = Path(lote["carpeta"]).exists()
        return datos

    def _registrar_historial(self, lote: Lote) -> None:
        estados = [d.estado for d in lote.documentos]
        entrada = {
            "fecha": datetime.now().isoformat(timespec="seconds"),
            "carpeta": str(lote.carpeta),
            "total": len(estados),
            "completados": estados.count("completado"),
            "errores": estados.count("error"),
            "cancelados": len(estados) - estados.count("completado") - estados.count("error"),
        }
        previos = [{k: v for k, v in e.items() if k != "existe"} for e in self.historial()]
        self._ruta_historial.write_text(
            json.dumps([entrada] + previos[:199], ensure_ascii=False, indent=2), encoding="utf-8"
        )
