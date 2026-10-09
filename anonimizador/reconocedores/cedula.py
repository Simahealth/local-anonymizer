import re

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

# Prefijo que marca al número como documento de identidad.
#   CC, C.C., C. C. | cédula [de ciudadanía] | TI, T.I., tarjeta de identidad
#   | documento de identidad/identificación
_PREFIJO = (
    r"(?:"
    r"C\.?\s*C\.?|"
    r"[Cc][eé]dula(?:\s+de\s+ciudadan[ií]a)?|"
    r"T\.?\s*I\.?|tarjeta\s+de\s+identidad|"
    r"[Dd]ocumento\s+de\s+identi(?:dad|ficaci[oó]n)"
    r")"
)

# Separador opcional entre el prefijo y el número: "No.", "N°", "#", "número", ":".
_SEPARADOR = r"[\s:]*(?:N[o°º]\.?|#|n[uú]mero)?[\s:]*"

# Separadores de miles en números colombianos: punto, espacio y apóstrofo de
# millones (recto ' o tipográfico ’), p. ej. 28'728.463 o 1.234.567.
_MILES_SEP = r"[.\s'’]"

# Número de 6 a 11 dígitos, con o sin separadores de miles / apóstrofo de millones.
#   1.234.567.890 | 79.456.123 | 28'728.463 | 52341890
_NUMERO = rf"(?:\d{{1,4}}(?:{_MILES_SEP}\d{{3}})+|\d{{6,11}})"

# NIT colombiano: 8–11 dígitos (planos o con separadores de miles/apóstrofo) +
# dígito de verificación, con espacios opcionales alrededor del guion.
#   901153056-7 | 901.153.056-7 | 28'728.463-1 | 900 123 456 - 7
_NIT = rf"(?:\d{{1,4}}(?:{_MILES_SEP}\d{{3}})+|\d{{8,11}})\s*-\s*\d"

# Prefijo explícito de NIT: "NIT", "NIT.", "Nit", "N.I.T." (con o sin puntos).
_PREFIJO_NIT = r"\b[Nn]\.?\s*[Ii]\.?\s*[Tt]\.?"

# Documento "suelto" (sin prefijo): formularios donde la cédula aparece sola en
# su línea. 8–9 u 11 dígitos, o 10 que NO empiecen por 3 (esos son celulares).
_SUELTO = r"(?:\d{8,9}|\d{11}|[0-24-9]\d{9})"

# Recorte final del span al número (NIT, con separadores de miles/apóstrofo, o plano).
_RECORTE = re.compile(r"(?:" + _NIT + r"|" + _NUMERO + r")$")

# Ancla para números SIN prefijo (suelto/NIT): exigir una marca de documento o un
# nombre en mayúsculas cerca, para no redactar números de registro de laboratorio
# o récords internos que aparecen aislados. Los términos genéricos ("paciente",
# "identi…") se mantienen porque ayudan al recall fuera de locale (DNI/NHC), pero
# los falsos positivos que disparaban en historias clínicas (Id. Consulta,
# Identificador Anonimizado) se filtran aparte vía _LABEL_NO_DOC.
_ANCLA_DOC = re.compile(
    r"c[eé]dula|\bcc\b|\bti\b|tarjeta|identi|documento|\bnit\b|paciente|"
    r"[A-ZÁÉÍÓÚÜÑ]{3,}[ \t]+[A-ZÁÉÍÓÚÜÑ]{3,}",
    re.IGNORECASE,
)
_VENTANA_DOC = 50

# Etiquetas de campos cuyo número NO es un documento de identidad: identificadores
# internos del formato de historia clínica (consulta, identificador anonimizado,
# folio, orden, autorización…). Si el número viene inmediatamente precedido por
# una de estas, se descarta aunque haya un ancla genérica cerca. Es lo que
# distingue "Id. Consulta: 14180408" (interno) de "cédula 1030630690" (real).
_LABEL_NO_DOC = re.compile(
    r"(?:id\.?\s*consulta|n[uú]mero\s+de\s+consulta|identificador|"
    r"folio|autorizaci[oó]n|factura)"
    r"[\s:#.\-]*$",
    re.IGNORECASE,
)
_VENTANA_NO_DOC = 30


class ReconocedorCedula(PatternRecognizer):
    """
    Detecta cédulas de ciudadanía (CC) y tarjetas de identidad (TI) colombianas.

    Solo coincide cuando el número aparece con un prefijo explícito (CC:, Cédula,
    TI:, Documento de identidad, etc.) para evitar falsos positivos con teléfonos
    y otros números. Acepta separadores de miles (1.234.567.890) y palabras
    intermedias como "No." o "de ciudadanía".

    La entidad retornada es CEDULA_CO y el valor es el número tal como aparece
    en el texto (incluidos sus puntos), para que el reemplazo lo cubra completo.
    """

    PATRONES = [
        Pattern(
            name="cedula_con_prefijo",
            regex=_PREFIJO + _SEPARADOR + _NUMERO,
            score=0.95,
        ),
        # NIT con prefijo explícito ("NIT 901.153.056-7"); el dígito de
        # verificación es opcional porque el prefijo ya ancla la coincidencia.
        Pattern(
            name="nit_con_prefijo",
            regex=_PREFIJO_NIT + _SEPARADOR + r"(?:" + _NIT + r"|" + _NUMERO + r")",
            score=0.95,
        ),
        # NIT por su formato distintivo (dígito de verificación), con o sin marca.
        Pattern(
            name="nit",
            regex=r"\b" + _NIT + r"\b",
            score=0.6,
        ),
        # Número suelto, formato de cédula. Score bajo: si solapa con teléfono o
        # registro médico (mayor score), gana esa etiqueta; si no, se redacta.
        Pattern(
            name="documento_suelto",
            regex=r"\b" + _SUELTO + r"\b",
            score=0.4,
        ),
    ]

    CONTEXTO = ["cédula", "cedula", "identificación", "identificacion", "documento",
                "cc", "ti", "nit", "tarjeta"]

    def __init__(self):
        super().__init__(
            supported_entity="CEDULA_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )

    def analyze(self, text, entities, nlp_artifacts=None):
        resultados = super().analyze(text, entities, nlp_artifacts)
        ajustados = []
        for r in resultados:
            # Recortar el span al número final, descartando el prefijo si lo hay.
            span = text[r.start:r.end]
            m = _RECORTE.search(span)
            if not m:
                continue
            ini, fin = r.start + m.start(), r.start + m.end()
            # Si el match es solo dígitos (suelto o NIT, sin prefijo en el span),
            # exigir un ancla de documento/nombre en el entorno y descartar si lo
            # precede una etiqueta de identificador interno (Id. Consulta, etc.).
            sin_prefijo = not re.search(r"[A-Za-z]", span)
            if sin_prefijo:
                antes = text[max(0, ini - _VENTANA_NO_DOC):ini]
                if _LABEL_NO_DOC.search(antes):
                    continue
                entorno = text[max(0, ini - _VENTANA_DOC):ini] + text[fin:fin + _VENTANA_DOC]
                if not _ANCLA_DOC.search(entorno):
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
