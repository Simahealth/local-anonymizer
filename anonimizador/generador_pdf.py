from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from .extractor import SALTO_PAGINA


class GeneradorPDF:
    """
    Genera un PDF con el texto anonimizado usando ReportLab.

    El PDF resultante es texto plano con ajuste de línea automático.
    No intenta reproducir el layout del documento original.
    """

    FUENTE = "Helvetica"
    TAMANO_FUENTE = 12
    ALTO_LINEA = 15
    ANCHO_MAX = 500
    MARGEN_X = 50
    MARGEN_Y = 50

    def __init__(self, carpeta_salida: Path):
        self.carpeta_salida = carpeta_salida
        self.carpeta_salida.mkdir(parents=True, exist_ok=True)

    def generar(self, id_paciente: str, texto: str) -> Path:
        """Escribe el PDF en carpeta_salida y retorna su ruta."""
        ruta = self.carpeta_salida / f"{id_paciente}.pdf"
        _, alto = letter

        c = canvas.Canvas(str(ruta), pagesize=letter)
        # Metadatos neutros: nada del documento original (título, autor) viaja al nuevo PDF.
        c.setTitle(id_paciente)
        c.setAuthor("")
        c.setCreator("SIMA Anonimizador")
        c.setFont(self.FUENTE, self.TAMANO_FUENTE)
        y = alto - self.MARGEN_Y

        # Una página nueva por cada página del original (SALTO_PAGINA), además de
        # las que haga falta si una página no cabe.
        for n, pagina in enumerate(texto.split(SALTO_PAGINA)):
            if n > 0:
                c.showPage()
                c.setFont(self.FUENTE, self.TAMANO_FUENTE)
                y = alto - self.MARGEN_Y
            for linea in pagina.strip("\n").split("\n"):
                for segmento in self._ajustar_linea(c, linea):
                    if y < self.MARGEN_Y:
                        c.showPage()
                        c.setFont(self.FUENTE, self.TAMANO_FUENTE)
                        y = alto - self.MARGEN_Y
                    c.drawString(self.MARGEN_X, y, segmento)
                    y -= self.ALTO_LINEA

        c.save()
        return ruta

    def _ajustar_linea(self, c: canvas.Canvas, linea: str) -> list[str]:
        """Divide una línea en segmentos que caben dentro de ANCHO_MAX."""
        if not linea.strip():
            return [""]

        palabras = linea.split()
        segmentos = []
        actual = ""

        for palabra in palabras:
            candidata = f"{actual} {palabra}".strip() if actual else palabra
            if c.stringWidth(candidata, self.FUENTE, self.TAMANO_FUENTE) <= self.ANCHO_MAX:
                actual = candidata
            else:
                if actual:
                    segmentos.append(actual)
                actual = palabra

        if actual:
            segmentos.append(actual)

        return segmentos
