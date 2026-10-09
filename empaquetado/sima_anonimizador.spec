# -*- mode: python ; coding: utf-8 -*-
"""Empaquetado con PyInstaller para macOS (.app) y Windows (carpeta con .exe).

PyInstaller no compila de forma cruzada: el .app se construye en macOS y el
.exe en Windows (ver .github/workflows/build.yml). Uso local:

    cd ui && npm ci && npm run build && cd ..
    pyinstaller --noconfirm empaquetado/sima_anonimizador.spec

Modo "onedir" (carpeta) en vez de "onefile": spaCy + el modelo pesan cientos de
MB y un onefile los descomprimiría en cada arranque (varios segundos).
"""
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

RAIZ = Path(SPECPATH).parent
NOMBRE = "SIMA Anonimizador"
VERSION = "1.1.0"

datas = [
    (str(RAIZ / "ui" / "dist"), "ui/dist"),
    (str(RAIZ / "anonimizador" / "datos"), "anonimizador/datos"),
]
binaries = []
hiddenimports = []

# Paquetes con datos/archivos que el análisis estático no ve: el modelo de
# spaCy, sus tablas de idioma, la configuración YAML de Presidio, la lista de
# sufijos de dominio de tldextract, las fuentes de ReportLab y el JS de pywebview.
for paquete in (
    "es_core_news_md", "spacy", "thinc", "presidio_analyzer", "tldextract",
    "reportlab", "webview", "pymupdf",
):
    d, b, h = collect_all(paquete)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [str(RAIZ / "main.py")],
    pathex=[str(RAIZ)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=[
        "tkinter", "matplotlib", "IPython", "pytest", "playwright",
        "torch", "transformers", "stanza", "spacy_huggingface_pipelines",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=NOMBRE,
    console=False,  # app de ventana: sin terminal
    icon=str(RAIZ / "empaquetado" / "iconos" / ("app.ico" if sys.platform == "win32" else "app.icns")),
    upx=False,
)

coll = COLLECT(exe, a.binaries, a.datas, name=NOMBRE, upx=False)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name=f"{NOMBRE}.app",
        icon=str(RAIZ / "empaquetado" / "iconos" / "app.icns"),
        bundle_identifier="co.simahealth.anonimizador",
        version=VERSION,
        info_plist={
            "CFBundleDisplayName": NOMBRE,
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "NSHumanReadableCopyright": "© SimaHealth",
        },
    )
