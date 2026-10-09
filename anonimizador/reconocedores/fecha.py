from presidio_analyzer import Pattern, PatternRecognizer

# Meses en español (incluye la variante "setiembre").
_MESES = (
    r"(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|"
    r"septiembre|setiembre|octubre|noviembre|diciembre)"
)


class ReconocedorFecha(PatternRecognizer):
    """
    Detecta fechas en español en los formatos habituales de historias clínicas.

    El modelo es_core_news_md de spaCy no etiqueta fechas (no tiene entidad
    DATE), por lo que sin este reconocedor las fechas se filtran. Cubre:

      - Numéricas:  03/05/1958, 22-02-2024
      - ISO:        2024-02-25
      - Textuales:  22 de febrero de 2024, 10 de marzo
      - No canónica (mes primero): Enero 26 de 1970, Marzo 12 de 2020

    La entidad retornada es FECHA_CO. El detector la mapea a "fechas".
    No distingue fechas de nacimiento: esas se redactan igual como fecha.
    """

    PATRONES = [
        Pattern(
            name="fecha_numerica",
            regex=r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
            score=0.85,
        ),
        Pattern(
            name="fecha_iso",
            regex=r"\b\d{4}-\d{1,2}-\d{1,2}\b",
            score=0.85,
        ),
        Pattern(
            name="fecha_textual",
            regex=rf"\b\d{{1,2}}\s+de\s+{_MESES}(?:\s+de\s+\d{{4}})?\b",
            score=0.85,
        ),
        # Variante no canónica con el mes primero (frecuente al inicio de frase y
        # con el mes en mayúscula): "Enero 26 de 1970", "Marzo 12 de 2020".
        Pattern(
            name="fecha_textual_inversa",
            regex=rf"\b(?i:{_MESES})\s+\d{{1,2}}\s+de\s+\d{{4}}\b",
            score=0.85,
        ),
    ]

    CONTEXTO = ["fecha", "nacimiento", "atención", "atencion", "ingreso", "egreso", "control"]

    def __init__(self):
        super().__init__(
            supported_entity="FECHA_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )
