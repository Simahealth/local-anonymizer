import re

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult


class ReconocedorEdad(PatternRecognizer):
    """
    Detecta edades de pacientes en texto clínico.

    Solo coincide cuando el número aparece en un contexto que lo marca como edad
    ("de 34 años", "Edad: 67", "8 años de edad"). Esto evita redactar duraciones
    como "antecedente de hace 12 años", que no son PII.

    La entidad retornada es EDAD_CO. El valor se recorta a la edad ("34 años")
    sin la palabra de contexto que la precede.
    """

    PATRONES = [
        Pattern(
            name="edad_con_de",
            regex=r"\bde\s+\d{1,3}\s+a(?:ñ|n)os?\b",
            score=0.85,
        ),
        Pattern(
            name="edad_de_edad",
            regex=r"\b\d{1,3}\s+a(?:ñ|n)os?\s+de\s+edad\b",
            score=0.9,
        ),
        Pattern(
            name="edad_etiqueta",
            regex=r"\b[Ee]dad\s*:?\s*\d{1,3}(?:\s+a(?:ñ|n)os?)?\b",
            score=0.9,
        ),
    ]

    CONTEXTO = ["edad", "años", "paciente", "menor", "nació", "nacio"]

    def __init__(self):
        super().__init__(
            supported_entity="EDAD_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )

    def analyze(self, text, entities, nlp_artifacts=None):
        resultados = super().analyze(text, entities, nlp_artifacts)
        ajustados = []
        for r in resultados:
            span = text[r.start:r.end]
            # Recortar a la edad en sí ("34 años"), descartando "de". Sin la
            # palabra "años" ("Edad: 3") se conserva la etiqueta: con el valor
            # "3" solo, el reemplazo ocultaba cada "3" del documento (dosis, días).
            m = re.search(r"\d{1,3}\s+a(?:ñ|n)os?", span) or re.search(r"\S.*\d", span)
            if m:
                ajustados.append(RecognizerResult(
                    entity_type=r.entity_type,
                    start=r.start + m.start(),
                    end=r.start + m.end(),
                    score=r.score,
                    analysis_explanation=r.analysis_explanation,
                    recognition_metadata=r.recognition_metadata,
                ))
        return ajustados
