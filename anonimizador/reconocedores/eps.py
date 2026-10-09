import re

from presidio_analyzer import Pattern, PatternRecognizer


# EPS/EAPB colombianas. Lista construida a partir del registro oficial de
# Entidades Administradoras de Planes de Beneficios (dataset datos.gov.co
# vn4w-8ucg, derivado del REPS) más las EPS vigentes que ese snapshot no trae,
# y completada con evidencia del corpus real (p. ej. "COOPERATIVA COMPARTA").
#
# Incluye a propósito EPS LIQUIDADAS (Saludcoop, Cafesalud, Caprecom, Cruz
# Blanca, Humana Vivir…): aparecen en historias clínicas antiguas. La detección
# es por nombre literal e INSENSIBLE a mayúsculas/minúsculas, así que se omiten
# tokens ambiguos que dispararían FP como palabra común (SOS, ISS, Cóndor,
# "Red Salud") y los fragmentos genéricos de la razón social ("Entidad Promotora
# de Salud…", "Asociación de Cabildos…").
#
# Las IPS NO se enumeran: el REPS de prestadores trae ~77 000 sedes con nombres
# genéricos y de persona (Hospital San Rafael, Clínica…, ESE…) que, con match
# literal insensible a caja, provocarían una explosión de falsos positivos.
EPS_CONOCIDAS = [
    # --- Vigentes / de mayor cobertura ---
    "Sanitas",
    "Colsanitas",
    "Sura",
    "Nueva EPS",
    "Compensar",
    "Famisanar",
    "Coosalud",
    "Cajacopi",
    "Comfenalco",
    "Comfamiliar",
    "SaludTotal",
    "Salud Total",
    "Coomeva",
    "AIC",
    "Asmet Salud",
    "Emssanar",
    "Mutual Ser",
    "Aliansalud",
    "Capital Salud",
    "Savia Salud",
    "Salud Bolívar",
    "Salud Bolivar",
    "Salud Mía",
    "Salud Mia",
    "Comparta",
    "Ecoopsos",
    "Capresoca",
    # --- Liquidadas / históricas (aparecen en HC antiguas) ---
    "Medimás",
    "Medimas",
    "Saludcoop",
    "Cafesalud",
    "Caprecom",
    "Cajanal",
    "Cruz Blanca",
    "Humana Vivir",
    "Golden Group",
    "Solsalud",
    "Saludvida",
    "Calisalud",
    "Convida",
    "Selvasalud",
    "Colpatria",
    "Saludcolombia",
    "Multimédicas",
    "Multimedicas",
    "Bonsalud",
    "Barranquilla Sana",
    "Unimec",
    "Colseguros",
    # --- Indígenas / regionales (REPS) ---
    "Dusakawi",
    "Mallamas",
    "Manexka",
    "Anas Wayuu",
    "Anaswayuu",
    "Pijaos Salud",
    "Pijaosalud",
]

CONTEXTO = ["eps", "ips", "aseguradora", "seguro", "afiliado", "afiliada", "régimen"]


class ReconocedorEPS(PatternRecognizer):
    """
    Detecta nombres de EPS e IPS colombianas en texto clínico.

    La entidad retornada es EPS_CO. El detector la mapea a "seguros".
    """

    def __init__(self):
        patrones = [
            Pattern(
                name=f"eps_{re.sub(r'[^a-z]', '_', nombre.lower())}",
                regex=rf"\b{re.escape(nombre)}\b",
                score=0.9,
            )
            for nombre in EPS_CONOCIDAS
        ]
        super().__init__(
            supported_entity="EPS_CO",
            patterns=patrones,
            context=CONTEXTO,
            supported_language="es",
        )
