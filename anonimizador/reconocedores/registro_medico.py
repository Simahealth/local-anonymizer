import re

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

# Marca de número de registro profesional del médico o de historia clínica.
#   RM, R.M., RM:, Registro Médico, Reg. Médico, Tarjeta Profesional, T.P., RETHUS,
#   HC, H.C., HC-, Historia Clínica
_PREFIJO = (
    r"(?:"
    r"R\.?\s*M\.?|"
    r"[Rr]egistro\s+m[eé]dico|"
    r"[Rr]eg\.?\s*m[eé]d(?:ico)?\.?|"
    r"[Tt]arjeta\s+profesional|"
    r"T\.?\s*P\.?|"
    r"RETHUS|"
    r"H\.?\s*C\.?|"
    r"[Hh]istoria\s+cl[ií]nica"
    r")"
)

# Separador opcional entre el prefijo y el número: "No.", "#", "-", ":", espacios.
#   Incluye el guion para la forma "HC-123456".
_SEPARADOR = r"[\s:]*(?:N[o°º]\.?|#)?[\s:-]*"

# Número de registro: 4–12 dígitos, con sufijo de año opcional (6813269/2011).
_NUMERO = r"\d{4,12}(?:/\d{2,4})?"

# Ancla para números SIN prefijo: exigir una marca de registro/historia clínica
# cerca, para no redactar cualquier número aislado. Mismo enfoque que la cédula.
_ANCLA_REG = re.compile(
    r"registro|historia\s+cl[ií]nica|\bh\.?c\b|tarjeta\s+profesional|"
    r"rethus|\br\.?m\b|\bt\.?p\b",
    re.IGNORECASE,
)
_VENTANA_REG = 40

# Prefijo "HC"/"H.C." pegado al número: forma parte del identificador de historia
# clínica (p. ej. HC-900581) y se conserva en el span, a diferencia de las marcas
# descriptivas ("Registro médico", "RM") que sí se recortan dejando solo el número.
_PREFIJO_COMPACTO = re.compile(r"H\.?\s*C\.?[\s:#-]*$", re.IGNORECASE)


class ReconocedorRegistroMedico(PatternRecognizer):
    """
    Detecta números de registro/tarjeta profesional del personal médico.

    Solo coincide con un prefijo explícito (RM, RM:, Registro Médico, Tarjeta
    Profesional, RETHUS) para no confundirlo con cédulas u otros números. Acepta
    el sufijo de año habitual en las tarjetas profesionales (p. ej. 6813269/2011).

    La entidad retornada es REGISTRO_CO; el detector la mapea a "numeros_registro".
    El valor es solo el número (sin el prefijo), tal como lo redactaría un humano.
    """

    PATRONES = [
        Pattern(
            name="registro_con_prefijo",
            regex=_PREFIJO + _SEPARADOR + _NUMERO,
            score=0.9,
        ),
        # Número suelto (sin marca): formularios donde el registro aparece solo.
        # Score bajo y validado por ancla en analyze(); si solapa con un teléfono
        # o cédula (mayor score), gana esa etiqueta.
        Pattern(
            name="registro_suelto",
            regex=r"\b" + _NUMERO + r"\b",
            score=0.45,
        ),
    ]

    CONTEXTO = ["registro", "médico", "medico", "profesional", "tarjeta", "rethus", "rm"]

    def __init__(self):
        super().__init__(
            supported_entity="REGISTRO_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )

    def analyze(self, text, entities, nlp_artifacts=None):
        resultados = super().analyze(text, entities, nlp_artifacts)
        ajustados = []
        for r in resultados:
            # Recortar el span al número final, descartando el prefijo "RM"/"HC".
            span = text[r.start:r.end]
            m = re.search(_NUMERO + r"$", span)
            if not m:
                continue
            ini, fin = r.start + m.start(), r.start + m.end()
            # Conservar el prefijo compacto "HC-" si precede al número: es parte
            # del identificador de historia clínica, no una etiqueta descriptiva.
            comp = _PREFIJO_COMPACTO.search(span[:m.start()])
            if comp:
                ini = r.start + comp.start()
            # Si el match es solo dígitos (suelto, sin prefijo en el span), exigir
            # una marca de registro/historia clínica en el entorno.
            sin_prefijo = not re.search(r"[A-Za-z]", span)
            if sin_prefijo:
                entorno = text[max(0, ini - _VENTANA_REG):ini] + text[fin:fin + _VENTANA_REG]
                if not _ANCLA_REG.search(entorno):
                    continue
            ajustados.append(RecognizerResult(
                entity_type=r.entity_type,
                start=ini,
                end=fin,
                score=r.score,
                analysis_explanation=r.analysis_explanation,
                recognition_metadata=r.recognition_metadata,
            ))
        return ajustados
