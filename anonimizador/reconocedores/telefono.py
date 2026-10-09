from presidio_analyzer import Pattern, PatternRecognizer


class ReconocedorTelefonoColombia(PatternRecognizer):
    """
    Detecta números de teléfono colombianos.

    Acepta prefijo internacional opcional (+57 / 57) y separadores
    (espacio, punto o guion) entre las agrupaciones.

    Formatos reconocidos:
      - Celulares: 10 dígitos que empiezan con 3, con agrupación 3XX XXX XXXX
        (ej: 3001234567, 300 123 4567, 300.123.4567, +57 300 1234567)
      - Fijos con indicativo: indicativo de 3 dígitos + 7 dígitos, con o sin
        paréntesis (ej: 601 2345678, (601) 2345678, +57 601 2345678)

    La entidad retornada es TELEFONO_CO. El detector la mapea a "telefonos".
    """

    # Prefijo internacional opcional y clase de separadores reutilizables.
    _PREFIJO = r"(?:\+?57[\s.-]?)?"
    _SEP = r"[\s.-]?"

    PATRONES = [
        Pattern(
            name="celular_colombiano",
            # +57? 3XX (sep) XXX (sep) XXXX, evitando dígitos adyacentes.
            regex=rf"(?<!\d){_PREFIJO}3\d{{2}}{_SEP}\d{{3}}{_SEP}\d{{4}}(?!\d)",
            score=0.85,
        ),
        Pattern(
            name="fijo_con_indicativo",
            # +57? (?indicativo?) (sep) XXXXXXX
            regex=rf"(?<!\d){_PREFIJO}\(?(?:60[1-9]|6[1-9]\d)\)?{_SEP}\d{{7}}(?!\d)",
            score=0.75,
        ),
    ]

    CONTEXTO = ["teléfono", "telefono", "celular", "móvil", "movil", "fijo", "contacto", "cel"]

    def __init__(self):
        super().__init__(
            supported_entity="TELEFONO_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )
