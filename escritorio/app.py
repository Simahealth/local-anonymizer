"""Punto de entrada de la app de escritorio (macOS y Windows).

Abre una ventana nativa (WKWebView en macOS, WebView2 en Windows) con la
interfaz React compilada en `ui/dist`, y le expone `ApiEscritorio`.

    python -m escritorio.app            # interfaz compilada (ui/dist)
    python -m escritorio.app --dev      # contra el servidor de Vite (npm run dev)
    "SIMA Anonimizador" --autoprueba <carpeta_pdfs> <carpeta_salida>

`--autoprueba` corre un lote sin ventana con el motor tal como quedó
empaquetado y escribe `autoprueba.json` en la carpeta de salida. Lo usa CI para
verificar el ejecutable de cada plataforma (spaCy, Presidio y el modelo dentro
del bundle), no solo que compile.
"""

import json
import sys
from pathlib import Path

import webview
from webview.dom import DOMEventHandler

from .api import NOMBRE_APP, ApiEscritorio, pdfs_en

URL_DEV = "http://localhost:5317"


def raiz_recursos() -> Path:
    """Raíz de los recursos: el bundle de PyInstaller, o el repo en desarrollo."""
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))


def al_soltar(ventana: webview.Window, evento: dict) -> None:
    """Archivos/carpetas arrastrados a la ventana. El navegador no expone rutas
    del disco; pywebview sí (`pywebviewFullPath`). Se reenvían a la interfaz
    como un evento `sima:archivos` con los PDF encontrados."""
    rutas = [
        f["pywebviewFullPath"]
        for f in evento.get("dataTransfer", {}).get("files", [])
        if f.get("pywebviewFullPath")
    ]
    archivos = pdfs_en(rutas)
    ventana.evaluate_js(
        f"window.dispatchEvent(new CustomEvent('sima:archivos', {{detail: {json.dumps(archivos)}}}))"
    )


def autoprueba(origen: str, salida: str) -> int:
    from anonimizador.lote import Anonimizador, Lote

    lote = Lote([a["ruta"] for a in pdfs_en([origen])], salida)
    lote.procesar(Anonimizador())
    estados = [d.estado for d in lote.documentos]
    resumen = {
        "total": len(estados),
        "completados": estados.count("completado"),
        "errores": [d.error for d in lote.documentos if d.error],
        "carpeta": str(lote.carpeta),
    }
    Path(salida, "autoprueba.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2))
    return 0 if resumen["total"] and resumen["completados"] == resumen["total"] else 1


def main() -> None:
    if "--autoprueba" in sys.argv:
        i = sys.argv.index("--autoprueba")
        sys.exit(autoprueba(sys.argv[i + 1], sys.argv[i + 2]))

    dev = "--dev" in sys.argv
    url = URL_DEV if dev else str(raiz_recursos() / "ui" / "dist" / "index.html")

    ventana = webview.create_window(
        NOMBRE_APP,
        url,
        js_api=ApiEscritorio(),
        width=1180,
        height=800,
        min_size=(900, 640),
        background_color="#FBFCFD",
    )

    def al_cargar():
        ventana.dom.document.events.drop += DOMEventHandler(
            lambda e: al_soltar(ventana, e), prevent_default=True
        )

    ventana.events.loaded += al_cargar
    # private_mode=False: localStorage (preferencias de la interfaz) persiste.
    webview.start(debug=dev, http_server=not dev, private_mode=False)


if __name__ == "__main__":
    main()
