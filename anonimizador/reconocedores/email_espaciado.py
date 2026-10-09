from presidio_analyzer import Pattern, PatternRecognizer

# Correos escritos sin "@" ni puntos, como los deja el export del EHR al quitar
# la puntuación: "contabilidad2101 gmail com", "corazonesval ioir org co". El
# reconocedor de email de Presidio exige "@", así que estos pasaban de largo.
_DOMINIOS = r"(?:gmail|hotmail|yahoo|outlook|live|icloud|une|etb|msn|aol|protonmail)"
_USUARIO = r"[a-z0-9._-]{3,}"
_TLD = r"(?:com|es|net|org|co|edu)(?:\s+co)?"

_PATRON_PROVEEDOR = rf"\b{_USUARIO}\s+{_DOMINIOS}\s+{_TLD}\b"
# Dominio cualquiera, pero solo tras la palabra "correo/email/mail".
_PATRON_CON_ANCLA = rf"(?<=correo\s)(?:electronico\s+)?{_USUARIO}\s+[a-z0-9-]{{2,}}\s+(?:org|com|net|edu)(?:\s+co)?\b"


class ReconocedorEmailEspaciado(PatternRecognizer):
    """Correos sin '@' ('usuario gmail com'). Entidad EMAIL_ESPACIADO → emails."""

    PATRONES = [
        Pattern(name="email_espaciado_proveedor", regex=_PATRON_PROVEEDOR, score=0.8),
        Pattern(name="email_espaciado_ancla", regex=_PATRON_CON_ANCLA, score=0.7),
    ]

    def __init__(self):
        super().__init__(
            supported_entity="EMAIL_ESPACIADO",
            patterns=self.PATRONES,
            context=["correo", "email", "mail", "electronico"],
            supported_language="es",
            global_regex_flags=0,
        )
