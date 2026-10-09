"""Anonimización por lotes: muchos PDF → PDFs anonimizados + tabla de relación.

Cada documento recibe un código aleatorio (HC-XXXXXXXX) que pasa a ser el
nombre de su PDF anonimizado. La tabla de relación (Excel y CSV) asocia el
nombre original de cada archivo con su código: es la ÚNICA forma de volver a
identificar al paciente, así que se guarda aparte, fuera de la carpeta de PDFs.

Estructura de salida, una carpeta por lote:

    <destino>/Lote_2026-10-09_143015/
        anonimizados/HC-7F3A9C21.pdf …
        relacion_codigos.xlsx
        relacion_codigos.csv
"""

import csv
import secrets
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable

from .detector import DetectorPII
from .extractor import ExtractorPDF, PDFProtegido
from .generador_pdf import GeneradorPDF
from .reemplazador import Reemplazador

# Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos fáciles de transcribir.
_ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_LARGO_CODIGO = 8

# Nombres legibles de las categorías para la tabla de relación.
NOMBRES_CATEGORIA = {
    "nombres": "Nombres",
    "documentos": "Documentos",
    "telefonos": "Teléfonos",
    "fechas_nacimiento": "Fechas de nacimiento",
    "direcciones": "Direcciones",
    "emails": "Correos",
    "fechas": "Fechas",
    "edades": "Edades",
    "ubicaciones": "Ubicaciones",
    "seguros": "EPS / seguros",
    "numeros_registro": "Números de registro",
}

COLUMNAS_RELACION = [
    "Código", "Archivo original", "Archivo anonimizado", "Estado",
    "Datos anonimizados", "Detalle", "Observación", "Fecha de proceso",
]


class ErrorDocumento(Exception):
    """Error esperado de un documento (sin texto, dañado…): se reporta sin traza."""


@dataclass
class ResultadoDocumento:
    codigo: str
    archivo_original: str
    ruta_original: str
    archivo_anonimizado: str = ""
    estado: str = "pendiente"  # pendiente | procesando | completado | error
    pii_por_categoria: dict[str, int] = field(default_factory=dict)
    error: str = ""
    fecha: str = ""

    @property
    def total_pii(self) -> int:
        return sum(self.pii_por_categoria.values())

    def a_dict(self) -> dict:
        return {
            "codigo": self.codigo,
            "archivoOriginal": self.archivo_original,
            "rutaOriginal": self.ruta_original,
            "archivoAnonimizado": self.archivo_anonimizado,
            "estado": self.estado,
            "piiPorCategoria": self.pii_por_categoria,
            "totalPii": self.total_pii,
            "error": self.error,
        }


def generar_codigo(usados: set[str]) -> str:
    """Código aleatorio no repetido dentro del lote. Aleatorio (no secuencial)
    para que el código no delate el orden ni la posición alfabética del archivo
    original."""
    while True:
        codigo = "HC-" + "".join(secrets.choice(_ALFABETO) for _ in range(_LARGO_CODIGO))
        if codigo not in usados:
            usados.add(codigo)
            return codigo


class Anonimizador:
    """Pipeline completo para un documento. Construirlo carga spaCy (unos
    segundos): crear uno solo y reutilizarlo para todo el lote."""

    def __init__(self):
        self._extractor = ExtractorPDF()
        self._detector = DetectorPII()
        self._reemplazador = Reemplazador()

    def anonimizar_texto(self, texto: str) -> tuple[str, dict[str, set[str]]]:
        pii = self._detector.detectar(texto)
        return self._reemplazador.reemplazar(texto, pii), pii

    def anonimizar_pdf(self, origen: Path, destino: Path) -> dict[str, int]:
        """Anonimiza `origen` y escribe el PDF en `destino`. Retorna el conteo de PII."""
        try:
            texto = self._extractor.extraer(origen)
        except PDFProtegido as e:
            raise ErrorDocumento("El PDF está protegido con contraseña.") from e
        except Exception as e:
            raise ErrorDocumento(f"No se pudo leer el PDF ({e.__class__.__name__}).") from e
        if not texto or len(texto.strip()) < 10:
            raise ErrorDocumento(
                "El PDF no tiene texto seleccionable (¿es un escaneo?). "
                "Pásalo primero por OCR."
            )
        anonimizado, pii = self.anonimizar_texto(texto)
        GeneradorPDF(destino.parent).generar(destino.stem, anonimizado)
        return {cat: len(vals) for cat, vals in pii.items() if vals}


class Lote:
    """Un lote de documentos y su carpeta de salida."""

    def __init__(self, rutas: Iterable[str | Path], carpeta_destino: str | Path):
        momento = datetime.now()
        self.carpeta = self._carpeta_libre(
            Path(carpeta_destino) / f"Lote_{momento:%Y-%m-%d_%H%M%S}"
        )
        self.carpeta_pdfs = self.carpeta / "anonimizados"
        usados: set[str] = set()
        self.documentos = [
            ResultadoDocumento(
                codigo=generar_codigo(usados),
                archivo_original=Path(r).name,
                ruta_original=str(Path(r)),
            )
            for r in rutas
        ]

    @staticmethod
    def _carpeta_libre(carpeta: Path) -> Path:
        candidata, n = carpeta, 2
        while candidata.exists():
            candidata = carpeta.with_name(f"{carpeta.name}_{n}")
            n += 1
        return candidata

    def procesar(
        self,
        anonimizador: Anonimizador,
        al_avanzar: Callable[[ResultadoDocumento], None] = lambda _: None,
        cancelado: Callable[[], bool] = lambda: False,
    ) -> None:
        """Procesa los documentos en orden. Un error en un documento no detiene
        el lote: queda marcado y se sigue con el siguiente."""
        self.carpeta_pdfs.mkdir(parents=True, exist_ok=True)
        for doc in self.documentos:
            if cancelado():
                break
            doc.estado = "procesando"
            al_avanzar(doc)
            try:
                destino = self.carpeta_pdfs / f"{doc.codigo}.pdf"
                doc.pii_por_categoria = anonimizador.anonimizar_pdf(Path(doc.ruta_original), destino)
                doc.archivo_anonimizado = destino.name
                doc.estado = "completado"
            except ErrorDocumento as e:
                doc.estado, doc.error = "error", str(e)
            except Exception as e:  # noqa: BLE001 — un documento raro no tumba el lote
                doc.estado, doc.error = "error", f"Error inesperado: {e.__class__.__name__}: {e}"
            doc.fecha = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            al_avanzar(doc)
        self.escribir_relacion()

    # ------------------------------------------------------------------ #
    # Tabla de relación
    # ------------------------------------------------------------------ #

    def _filas(self) -> list[list]:
        estados = {"completado": "Anonimizado", "error": "Error", "pendiente": "Cancelado",
                   "procesando": "Cancelado"}
        filas = []
        for d in self.documentos:
            detalle = "; ".join(
                f"{NOMBRES_CATEGORIA.get(cat, cat)}: {n}" for cat, n in d.pii_por_categoria.items()
            )
            filas.append([
                d.codigo, d.archivo_original, d.archivo_anonimizado, estados[d.estado],
                d.total_pii if d.estado == "completado" else "", detalle, d.error, d.fecha,
            ])
        return filas

    def escribir_relacion(self) -> tuple[Path, Path]:
        self.carpeta.mkdir(parents=True, exist_ok=True)
        filas = self._filas()

        ruta_csv = self.carpeta / "relacion_codigos.csv"
        # utf-8-sig: Excel abre bien las tildes; ';' es el separador que espera
        # Excel con configuración regional en español.
        with open(ruta_csv, "w", newline="", encoding="utf-8-sig") as f:
            escritor = csv.writer(f, delimiter=";")
            escritor.writerow(COLUMNAS_RELACION)
            escritor.writerows(filas)

        ruta_xlsx = self.carpeta / "relacion_codigos.xlsx"
        self._escribir_xlsx(ruta_xlsx, filas)
        return ruta_xlsx, ruta_csv

    @staticmethod
    def _escribir_xlsx(ruta: Path, filas: list[list]) -> None:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill

        libro = Workbook()
        hoja = libro.active
        hoja.title = "Relación de códigos"
        hoja.append(COLUMNAS_RELACION)
        for celda in hoja[1]:
            celda.font = Font(bold=True, color="FFFFFF")
            celda.fill = PatternFill("solid", fgColor="0D0F10")
        for fila in filas:
            hoja.append(fila)
        anchos = [16, 48, 22, 14, 18, 60, 50, 20]
        for i, ancho in enumerate(anchos):
            hoja.column_dimensions[chr(ord("A") + i)].width = ancho
        hoja.freeze_panes = "A2"
        hoja.auto_filter.ref = hoja.dimensions
        libro.save(ruta)
