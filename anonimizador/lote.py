"""Anonimización por lotes: muchos PDF → PDFs anonimizados + tabla de relación.

Cada documento recibe un código aleatorio (HC-XXXXXXXX) que pasa a ser el
nombre de su PDF anonimizado. La tabla de relación (Excel y CSV) asocia el
nombre original de cada archivo con su código: es la ÚNICA forma de volver a
identificar al paciente, así que se guarda aparte, fuera de la carpeta de PDFs.

Estructura de salida, una carpeta por lote:

    <destino>/Lote_2026-10-09_143015/
        anonimizados/HC-7F3A9C21.pdf …     ← lo único que se comparte
        relacion_codigos.xlsx / .csv        ← sensible: reidentifica
        lote.sqlite                         ← sensible: cola + textos originales

El estado vive en `lote.sqlite` (ver almacen.py): el lote se puede pausar,
cerrar la app y reanudar, y cada documento se puede revisar y corregir después.
"""

import csv
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable

from .almacen import Almacen, TramoGuardado
from .detector import ETIQUETAS_PII, DetectorPII
from .extractor import SALTO_PAGINA, ExtractorPDF, PDFProtegido
from .generador_pdf import GeneradorPDF
from .memoria import GestorMemoria, fragmentar
from .reemplazador import Reemplazador, Tramo, _patron_literal, aplicar

# Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para códigos fáciles de transcribir.
_ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_LARGO_CODIGO = 8

COLUMNAS_RELACION = [
    "Código", "Archivo original", "Ruta original", "Archivo anonimizado", "Estado",
    "Datos anonimizados", "Revisado", "Observación", "Fecha de proceso",
]
_ESTADOS_RELACION = {
    "completado": "Anonimizado", "error": "Error", "pendiente": "Pendiente", "procesando": "Pendiente",
}


class ErrorDocumento(Exception):
    """Error esperado de un documento (sin texto, dañado…): se reporta sin traza."""


def generar_codigo(usados: set[str]) -> str:
    """Código aleatorio no repetido dentro del lote. Aleatorio (no secuencial)
    para que el código no delate el orden ni la posición alfabética del archivo
    original."""
    while True:
        codigo = "HC-" + "".join(secrets.choice(_ALFABETO) for _ in range(_LARGO_CODIGO))
        if codigo not in usados:
            usados.add(codigo)
            return codigo


def _ahora() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class Anonimizador:
    """Pipeline completo para un documento. Construirlo carga spaCy (alrededor
    de un segundo): crear uno solo y reutilizarlo para todo el lote."""

    def __init__(self):
        self._extractor = ExtractorPDF()
        self._detector = DetectorPII()
        self._reemplazador = Reemplazador()

    @property
    def modelo_nombres_disponible(self) -> bool:
        return self._detector.modelo_nombres_disponible

    def recargar(self) -> None:
        """Descarta el modelo y lo vuelve a cargar (libera el vocabulario que
        spaCy acumula en lotes largos; ver memoria.py)."""
        self._detector = None
        self._detector = DetectorPII()

    def detectar_tramos(self, texto: str, tamano_fragmento: int = 200_000) -> list[Tramo]:
        """Tramos a ocultar. Los textos largos se analizan por fragmentos: los
        valores detectados en cualquiera de ellos se buscan luego en el texto
        completo, así un nombre visto en la página 1 se oculta también en la 80."""
        pii: dict[str, set[str]] = {cat: set() for cat in ETIQUETAS_PII}
        for _, fragmento in fragmentar(texto, tamano_fragmento):
            for cat, valores in self._detector.detectar(fragmento).items():
                pii[cat] |= valores
        return self._reemplazador.calcular_tramos(texto, pii)

    def anonimizar_texto(self, texto: str) -> tuple[str, list[Tramo]]:
        tramos = self.detectar_tramos(texto)
        return aplicar(texto, tramos), tramos

    def extraer(self, origen: Path) -> str:
        try:
            texto = self._extractor.extraer(origen)
        except PDFProtegido as e:
            raise ErrorDocumento("El PDF está protegido con contraseña.") from e
        except Exception as e:
            raise ErrorDocumento(f"No se pudo leer el PDF ({e.__class__.__name__}).") from e
        if not texto or len(texto.replace(SALTO_PAGINA, "").strip()) < 10:
            raise ErrorDocumento(
                "El PDF no tiene texto seleccionable (¿es un escaneo?). Pásalo primero por OCR."
            )
        return texto

    def anonimizar_pdf(self, origen: Path, destino: Path) -> list[Tramo]:
        """Anonimiza `origen` y escribe el PDF en `destino`. Retorna los tramos ocultados."""
        texto = self.extraer(origen)
        tramos = self.detectar_tramos(texto)
        escribir_pdf(destino, texto, tramos)
        return tramos


def escribir_pdf(destino: Path, texto: str, tramos: Iterable[Tramo]) -> None:
    GeneradorPDF(destino.parent).generar(destino.stem, aplicar(texto, list(tramos)))


@dataclass
class EventoDocumento:
    """Lo que la interfaz necesita saber de un documento recién procesado."""

    codigo: str
    nombre: str
    estado: str
    total_pii: int = 0
    error: str = ""

    def a_dict(self) -> dict:
        return {"codigo": self.codigo, "nombre": self.nombre, "estado": self.estado,
                "totalPii": self.total_pii, "error": self.error}


class Lote:
    """Un lote de documentos, su carpeta de salida y su almacén."""

    def __init__(self, carpeta: Path):
        self.carpeta = Path(carpeta)
        self.carpeta_pdfs = self.carpeta / "anonimizados"
        self.almacen = Almacen(self.carpeta)

    # ------------------------------------------------------------------ #
    # Creación / apertura
    # ------------------------------------------------------------------ #

    @classmethod
    def crear(cls, rutas: Iterable[str | Path], carpeta_destino: str | Path) -> "Lote":
        momento = datetime.now()
        carpeta = cls._carpeta_libre(Path(carpeta_destino) / f"Lote_{momento:%Y-%m-%d_%H%M%S}")
        carpeta.mkdir(parents=True)
        lote = cls(carpeta)
        usados: set[str] = set()
        lote.almacen.agregar_documentos(
            [(generar_codigo(usados), Path(r).name, str(Path(r))) for r in rutas]
        )
        lote.almacen.fijar_meta("creado", momento.isoformat(timespec="seconds"))
        return lote

    @classmethod
    def abrir(cls, carpeta: str | Path) -> "Lote":
        if not Almacen.existe(Path(carpeta)):
            raise FileNotFoundError(f"No hay un lote en {carpeta}")
        return cls(Path(carpeta))

    @staticmethod
    def _carpeta_libre(carpeta: Path) -> Path:
        candidata, n = carpeta, 2
        while candidata.exists():
            candidata = carpeta.with_name(f"{carpeta.name}_{n}")
            n += 1
        return candidata

    # ------------------------------------------------------------------ #
    # Procesamiento
    # ------------------------------------------------------------------ #

    def procesar(
        self,
        anonimizador: Anonimizador,
        al_avanzar: Callable[[EventoDocumento], None] = lambda _: None,
        cancelado: Callable[[], bool] = lambda: False,
        memoria: GestorMemoria | None = None,
    ) -> None:
        """Procesa los pendientes en orden, de a uno, confirmando cada documento
        en el almacén apenas termina. Un error en un documento no detiene el
        lote. Si `cancelado()` se vuelve True, se detiene tras el documento en
        curso y el resto queda pendiente para reanudar."""
        memoria = memoria or GestorMemoria()
        self.carpeta_pdfs.mkdir(parents=True, exist_ok=True)
        self.almacen.reiniciar_interrumpidos()

        while not cancelado():
            memoria.esperar_memoria(cancelado)
            if cancelado():
                break
            doc = self.almacen.siguiente_pendiente()
            if doc is None:
                break
            self.almacen.marcar_procesando(doc["id"])
            al_avanzar(EventoDocumento(doc["codigo"], doc["nombre_original"], "procesando"))
            try:
                texto = anonimizador.extraer(Path(doc["ruta_original"]))
                tramos = anonimizador.detectar_tramos(texto, memoria.tamano_fragmento())
                escribir_pdf(self.carpeta_pdfs / f"{doc['codigo']}.pdf", texto, tramos)
                self.almacen.guardar_resultado(
                    doc["id"], texto, [(t.inicio, t.fin, t.categoria) for t in tramos],
                    texto.count(SALTO_PAGINA) + 1, _ahora(),
                )
                evento = EventoDocumento(doc["codigo"], doc["nombre_original"], "completado", len(tramos))
            except ErrorDocumento as e:
                self.almacen.guardar_error(doc["id"], str(e), _ahora())
                evento = EventoDocumento(doc["codigo"], doc["nombre_original"], "error", error=str(e))
            except Exception as e:  # noqa: BLE001 — un documento raro no tumba el lote
                mensaje = f"Error inesperado: {e.__class__.__name__}: {e}"
                self.almacen.guardar_error(doc["id"], mensaje, _ahora())
                evento = EventoDocumento(doc["codigo"], doc["nombre_original"], "error", error=mensaje)
            al_avanzar(evento)

            memoria.documento_procesado()
            if memoria.debe_reciclar():
                anonimizador.recargar()
                memoria.reciclado()

        self.escribir_relacion()

    # ------------------------------------------------------------------ #
    # Tabla de relación (en streaming: 50 000 filas sin cargarlas en memoria)
    # ------------------------------------------------------------------ #

    def _filas(self) -> Iterable[list]:
        for d in self.almacen.iterar_documentos():
            completado = d["estado"] == "completado"
            yield [
                d["codigo"], d["nombre_original"], d["ruta_original"],
                f"{d['codigo']}.pdf" if completado else "",
                _ESTADOS_RELACION[d["estado"]],
                d["total_pii"] if completado else "",
                ("Sí" if d["revisado"] else "No") if completado else "",
                d["error"], d["procesado_en"],
            ]

    def escribir_relacion(self) -> tuple[Path, Path]:
        ruta_csv = self.carpeta / "relacion_codigos.csv"
        # utf-8-sig: Excel abre bien las tildes; ';' es el separador que espera
        # Excel con configuración regional en español.
        with open(ruta_csv, "w", newline="", encoding="utf-8-sig") as f:
            escritor = csv.writer(f, delimiter=";")
            escritor.writerow(COLUMNAS_RELACION)
            escritor.writerows(self._filas())

        ruta_xlsx = self.carpeta / "relacion_codigos.xlsx"
        self._escribir_xlsx(ruta_xlsx)
        return ruta_xlsx, ruta_csv

    def _escribir_xlsx(self, ruta: Path) -> None:
        from openpyxl import Workbook
        from openpyxl.cell import WriteOnlyCell
        from openpyxl.styles import Font, PatternFill

        libro = Workbook(write_only=True)  # escribe fila a fila, memoria constante
        hoja = libro.create_sheet("Relación de códigos")
        for i, ancho in enumerate([16, 44, 60, 22, 14, 18, 10, 50, 20]):
            hoja.column_dimensions[chr(ord("A") + i)].width = ancho
        hoja.freeze_panes = "A2"
        encabezado = []
        for titulo in COLUMNAS_RELACION:
            celda = WriteOnlyCell(hoja, value=titulo)
            celda.font = Font(bold=True, color="FFFFFF")
            celda.fill = PatternFill("solid", fgColor="0D0F10")
            encabezado.append(celda)
        hoja.append(encabezado)
        for fila in self._filas():
            hoja.append(fila)
        libro.save(ruta)

    # ------------------------------------------------------------------ #
    # Revisión
    # ------------------------------------------------------------------ #

    def _doc(self, codigo: str):
        doc = self.almacen.documento(codigo)
        if doc is None:
            raise KeyError(codigo)
        return doc

    def regenerar_pdf(self, codigo: str) -> None:
        doc = self._doc(codigo)
        activos = [Tramo(t.inicio, t.fin, t.categoria) for t in self.almacen.tramos(doc["id"]) if t.activo]
        escribir_pdf(self.carpeta_pdfs / f"{codigo}.pdf", self.almacen.texto(doc["id"]), activos)

    def ocultar(self, codigo: str, inicio: int, fin: int, categoria: str, todas: bool) -> int:
        """Oculta texto[inicio:fin] (y, si `todas`, cada otra aparición de ese
        texto en el documento). Los tramos existentes que se solapen se absorben
        en el nuevo. Retorna cuántos tramos se agregaron."""
        if categoria not in ETIQUETAS_PII:
            raise ValueError(f"Categoría desconocida: {categoria}")
        doc = self._doc(codigo)
        texto = self.almacen.texto(doc["id"])
        # Sin espacios en los bordes de la selección.
        while inicio < fin and texto[inicio].isspace():
            inicio += 1
        while fin > inicio and texto[fin - 1].isspace():
            fin -= 1
        if inicio >= fin:
            return 0

        rangos = [(inicio, fin)]
        if todas:
            fragmento = texto[inicio:fin]
            rangos += [(m.start(), m.end()) for m in
                       re.finditer(_patron_literal(fragmento), texto, flags=re.IGNORECASE)]

        existentes = self.almacen.tramos(doc["id"])
        eliminar: set[int] = set()
        nuevos: list[tuple[int, int, str]] = []
        for ini, fn in sorted(set(rangos)):
            # Absorbe tramos existentes solapados (activos o revertidos).
            for t in existentes:
                if t.inicio < fn and ini < t.fin:
                    eliminar.add(t.id)
                    ini, fn = min(ini, t.inicio), max(fn, t.fin)
            if nuevos and ini < nuevos[-1][1]:
                nuevos[-1] = (nuevos[-1][0], max(fn, nuevos[-1][1]), categoria)
            else:
                nuevos.append((ini, fn, categoria))
        self.almacen.reemplazar_tramos(doc["id"], sorted(eliminar), nuevos)
        self.regenerar_pdf(codigo)
        return len(nuevos)

    def actualizar_tramo(
        self, codigo: str, tramo_id: int, activo: bool | None = None, categoria: str | None = None
    ) -> None:
        if categoria is not None and categoria not in ETIQUETAS_PII:
            raise ValueError(f"Categoría desconocida: {categoria}")
        doc = self._doc(codigo)
        self.almacen.actualizar_tramo(doc["id"], tramo_id, activo, categoria)
        self.regenerar_pdf(codigo)

    def alternar_valor(self, codigo: str, tramo_id: int, activo: bool) -> list[int]:
        """Muestra (activo=False) u oculta el tramo y TODOS los del documento con
        el mismo texto: si "canula" no es un dato personal, no lo es en ninguna
        de sus 12 apariciones. Retorna los ids cambiados (para deshacer)."""
        doc = self._doc(codigo)
        texto = self.almacen.texto(doc["id"])
        tramos = self.almacen.tramos(doc["id"])
        base = next((t for t in tramos if t.id == tramo_id), None)
        if base is None:
            return []
        clave = _clave(texto[base.inicio:base.fin])
        ids = [t.id for t in tramos if t.activo != activo and _clave(texto[t.inicio:t.fin]) == clave]
        self.almacen.fijar_activos(doc["id"], ids, activo)
        self.regenerar_pdf(codigo)
        return ids

    def cambiar_categoria(self, codigo: str, ids: list[int], categoria: str) -> None:
        if categoria not in ETIQUETAS_PII:
            raise ValueError(f"Categoría desconocida: {categoria}")
        doc = self._doc(codigo)
        for i in ids:
            self.almacen.actualizar_tramo(doc["id"], i, categoria=categoria)
        self.regenerar_pdf(codigo)

    def fijar_tramos(self, codigo: str, ids: list[int], activo: bool) -> None:
        """Estado explícito de un conjunto de tramos (deshacer)."""
        self.almacen.fijar_activos(self._doc(codigo)["id"], ids, activo)
        self.regenerar_pdf(codigo)

    def mostrar_en_lote(self, valor: str) -> dict:
        """Muestra `valor` en todos los documentos del lote (falso positivo
        repetido, p. ej. un término clínico que el detector tomó por nombre)."""
        cambios: dict[int, list[int]] = {}
        for tramo_id, doc_id in self.almacen.tramos_con_texto(" ".join(valor.split()), activo=True):
            cambios.setdefault(doc_id, []).append(tramo_id)
        for doc_id, ids in cambios.items():
            self.almacen.fijar_activos(doc_id, ids, False)
            self.regenerar_pdf(self.almacen.documento_por_id(doc_id)["codigo"])
        return {"documentos": len(cambios), "tramos": sum(len(v) for v in cambios.values())}

    def ocultar_en_lote(self, valor: str, categoria: str) -> dict:
        """Oculta `valor` (palabra completa) en todos los documentos del lote
        donde aparezca: un nombre que el detector no vio en ninguno."""
        valor = " ".join(valor.split())
        patron = re.compile(_patron_literal(valor), re.IGNORECASE)
        documentos = tramos = 0
        for doc in self.almacen.documentos_que_contienen(valor):
            m = patron.search(self.almacen.texto(doc["id"]))
            if m:
                tramos += self.ocultar(doc["codigo"], m.start(), m.end(), categoria, todas=True)
                documentos += 1
        return {"documentos": documentos, "tramos": tramos}

    def marcar_revisado(self, codigo: str, revisado: bool) -> None:
        self.almacen.marcar_revisado(self._doc(codigo)["id"], revisado)

    def documento_revision(self, codigo: str) -> dict:
        """Texto original + tramos, con offsets en unidades UTF-16 (las de
        JavaScript): un emoji o símbolo fuera del plano básico ocupa 1 code
        point en Python pero 2 unidades en JS."""
        doc = self._doc(codigo)
        texto = self.almacen.texto(doc["id"])
        a_js = mapa_utf16(texto)
        return {
            "codigo": doc["codigo"],
            "nombreOriginal": doc["nombre_original"],
            "rutaOriginal": doc["ruta_original"],
            "estado": doc["estado"],
            "error": doc["error"],
            "revisado": bool(doc["revisado"]),
            "texto": texto,
            "tramos": [_tramo_js(t, a_js) for t in self.almacen.tramos(doc["id"])],
        }


def _clave(fragmento: str) -> str:
    return " ".join(fragmento.lower().split())


def _tramo_js(t: TramoGuardado, a_js: Callable[[int], int]) -> dict:
    return {"id": t.id, "inicio": a_js(t.inicio), "fin": a_js(t.fin),
            "categoria": t.categoria, "origen": t.origen, "activo": t.activo}


def mapa_utf16(texto: str) -> Callable[[int], int]:
    """Offset en code points (Python) → offset en unidades UTF-16 (JS)."""
    if all(ord(c) <= 0xFFFF for c in texto):
        return lambda i: i
    acumulado = [0]
    for c in texto:
        acumulado.append(acumulado[-1] + (2 if ord(c) > 0xFFFF else 1))
    return lambda i: acumulado[i]


def desde_utf16(texto: str, offset_js: int) -> int:
    """Offset en unidades UTF-16 (JS) → offset en code points (Python)."""
    if all(ord(c) <= 0xFFFF for c in texto):
        return offset_js
    unidades = 0
    for i, c in enumerate(texto):
        if unidades >= offset_js:
            return i
        unidades += 2 if ord(c) > 0xFFFF else 1
    return len(texto)
