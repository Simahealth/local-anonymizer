from presidio_analyzer import Pattern, PatternRecognizer

# --------------------------------------------------------------------------- #
# Bloques de construcción
# --------------------------------------------------------------------------- #

# Tipos de vía colombianos. Se separan los nombres largos (Calle, Carrera…) de
# las abreviaturas cortas (Cl, Cra, Av…): las abreviaturas son ambiguas en texto
# clínico (p. ej. "AV" = bloqueo auriculoventricular), así que la nomenclatura
# sin separador (# / No.) les exige más estructura para no disparar de más.
_VIA_LARGA = (
    r"[Cc]alles?|[Cc]arreras?|[Aa]venidas?|[Dd]iagonal(?:es)?|"
    r"[Tt]ransversal(?:es)?|[Aa]utopista|[Cc]ircular|[Cc]arretera"
)
_VIA_ABREV = (
    r"[Cc]ll?|[Cc]ra|[Cc]r|[Kk]ra|[Kk]r|[Aa]v(?:da)?|[Dd]iag|[Dd]g|"
    r"[Tt]ransv|[Tt]v|[Mm]anzana|[Mm]z"
)
_VIA = rf"(?:{_VIA_LARGA}|{_VIA_ABREV})"

# Sufijos cardinales (Sur, Norte, Este, Oeste, Bis) que acompañan a vías y placas.
_CARD = r"(?:[Bb]is|[Ss]ur|[Nn]orte|[Ee]ste|[Oo]este)"

# Un grupo numérico de la nomenclatura: dígitos con hasta dos letras (45, 136a,
# 53a, 48x) o un ordinal pegado (5ta = quinta).
_NUM = r"\d+[A-Za-z]{0,2}"

# Separador de placa: #, No., N°, Nº, número.
_SEP = r"(?:#|N[°º]\.?|No\.?|[Nn][uú]mero)"

# Separador entre grupos numéricos: guion (con o sin espacios), o espacio con una
# letra suelta opcional en medio ("156 c 33" -> 156, c, 33).
_ENTRE = r"(?:\s*[-–]\s*|\s+(?:[A-Za-z]\s+)?)"

# Complementos de la dirección que suelen ir al final (Apto 5, casa 46, Torre 2…).
# Se capturan para que el span incluya toda la dirección, no solo la placa.
_COMPL_UNO = (
    r"[,\s]+(?:[Aa]pto\.?|[Aa]partamento|[Cc]asa|[Tt]orres?|[Bb]loques?|[Bb]l|"
    r"[Ii]nterior|[Ii]nt\.?|[Pp]isos?|[Ll]otes?|[Ll]t\.?)\s*\d+[A-Za-z]?"
)
_COMPL = rf"(?:{_COMPL_UNO})*"

# Identificador de la vía: primer grupo numérico, con cardinal y/o letra suelta
# opcional ("90 Sur", "99 b", "3 Este").
_ID_VIA = rf"{_NUM}(?:\s+{_CARD})?(?:\s+[A-Za-z](?=\s))?"


# --------------------------------------------------------------------------- #
# Patrones
# --------------------------------------------------------------------------- #

# 1) Placa con separador explícito (#, No., número). Muy específica: el separador
#    casi nunca aparece por azar. Cubre "Calle 45 # 23-15", "Cll 155 # 100-05",
#    "Carrera 100 a numero 156 c 33".
_PLACA = (
    rf"\b{_VIA}\.?\s+{_ID_VIA}\s*{_SEP}\s*"
    rf"{_NUM}{_ENTRE}{_NUM}(?:{_ENTRE}{_NUM})*"
    rf"(?:\s+{_CARD})?{_COMPL}"
)

# 2) Nomenclatura sin separador, espacios entre grupos ("Calle 155 100 05",
#    "cra 99 b 58 04 sur", "Cra 23 53a 65 apto 201", "Calle 136a 75 casa 46").
#    Para acotar falsos positivos exige, tras dos grupos numéricos, AL MENOS UNO
#    de: un tercer grupo, un cardinal o un complemento. Así "AV 2 1" (cardiología)
#    o "Talla 155 60" no alcanzan a matchear.
_NOMENCLATURA = (
    rf"\b{_VIA}\.?\s+{_ID_VIA}{_ENTRE}{_NUM}"
    rf"(?:"
    rf"(?:{_ENTRE}{_NUM})+(?:\s+{_CARD})?"      # un tercer grupo (o más) + cardinal opc.
    rf"|\s+{_CARD}"                              # o un cardinal
    rf"|{_COMPL_UNO}"                            # o un complemento (casa/apto/…)
    rf")"
    rf"{_COMPL}"
)

# Palabras que NO pueden formar parte del nombre de un lugar: cortan la captura
# para que el sector no se trague texto clínico contiguo ("barrio Marruecos
# estrato", "barrio las cruces motivo de consulta"). Se comparan sin distinguir
# mayúsculas (los patrones se compilan con IGNORECASE).
_STOP = (
    r"(?:motivo|consulta|paciente|refiere|presenta|reside|vive|"
    r"localidad|barrio|estrato|vereda|conjunto|urbanizaci[oó]n|municipio|mcpio|"
    r"control|antecedentes?|examen|enfermedad|actual|"
    r"con|por|para|sin|durante|desde|hasta|que|quien)"
)
# Una palabra de nombre de lugar: alfabética, que no sea una palabra de corte.
_PALABRA = rf"(?!{_STOP}\b)[A-Za-zÁÉÍÓÚáéíóúÑñ]{{2,}}"

# 3) Sector urbano/rural: Barrio / Localidad / Vereda / Corregimiento + nombre
#    (1-3 palabras). No se excluyen artículos iniciales: nombres reales empiezan
#    por artículo ("Barrio El Carmen") y, para anonimizar, capturar de más es
#    seguro. Sufijo opcional "..., municipio de X" / "..., mcpio de X": muy
#    común en direcciones rurales colombianas ("vereda Honduras, municipio de
#    Morales") — sin este sufijo el span se corta antes del municipio y ese
#    nombre queda sin redactar (fuga real, no solo un problema de la métrica).
# Separador entre palabras del nombre: solo espacio/tab, nunca salto de línea
# (si no, "barrio Manga\nTeléfono: ..." se traga la etiqueta de la línea siguiente).
_ESP = r"[ \t]+"
_NOMBRE_LUGAR = rf"{_PALABRA}(?:{_ESP}{_PALABRA}){{0,2}}"
_SUF_MUNICIPIO = rf"(?:[,\s]+(?:[Mm]unicipio|[Mm]cpio\.?)\s+de\s+{_NOMBRE_LUGAR})?"
_SECTOR = (
    rf"\b(?:[Bb]arrio|[Ll]ocalidad|[Vv]ereda|[Cc]orregimiento)\s+{_NOMBRE_LUGAR}{_SUF_MUNICIPIO}"
)

# 4) Urbanización / Finca / Conjunto residencial + nombre (hasta 4 palabras:
#    suelen ser más largos, "Finca El Jordan La Calera"). Se excluye "conjunto"
#    a secas: en texto clínico "en conjunto con ortopedia" no es una dirección.
_NOMBRE_LARGO = rf"{_PALABRA}(?:{_ESP}{_PALABRA}){{0,3}}"
_FINCA = (
    rf"\b(?:[Ff]inca|[Uu]rbanizaci[oó]n|"
    rf"[Cc]onjuntos?\s+(?:[Rr]esidencial(?:es)?|[Cc]errados?))"
    rf"\s+{_NOMBRE_LARGO}"
)

# 5) Manzana + casa/lote ("Manzana 14 Casa 11", "Mz B Lt 4"): nomenclatura de
#    barrios sin placa. Exige el complemento para no chocar con "manzana" a secas.
_MANZANA = (
    r"\b(?:[Mm]anzana|[Mm]z)\.?\s*[A-Za-z0-9]{1,4}[,\s]+"
    r"(?:[Cc]asa|[Ll]otes?|[Ll]t\.?)\s*\d+[A-Za-z]?"
)

# 6) Estrato socioeconómico ("Estrato 2"). Muy específico.
_ESTRATO = r"\b[Ee]strato\s+\d"


class ReconocedorDireccion(PatternRecognizer):
    """
    Detecta direcciones físicas con nomenclatura colombiana.

    Cubre seis formas, de mayor a menor confianza:

    1. Placa con separador ("Calle 45 # 23-15", "Carrera 100 numero 156 c 33").
    2. Nomenclatura sin separador, separada por espacios ("Calle 155 100 05",
       "cra 99 b 58 04 sur"). Exige estructura extra (tercer grupo, cardinal o
       complemento) para no chocar con valores clínicos ("AV 2 1", "Talla 155 60").
    3. Sector urbano ("Barrio Galerías", "Localidad Kennedy").
    4. Conjunto / urbanización / finca ("Finca El Jordán La Calera").
    5. Manzana + casa/lote ("Manzana 14 Casa 11").
    6. Estrato socioeconómico ("Estrato 2").

    La entidad retornada es DIRECCION_CO. El detector la mapea a "direcciones".
    """

    PATRONES = [
        Pattern(name="direccion_placa", regex=_PLACA, score=0.85),
        Pattern(name="direccion_nomenclatura", regex=_NOMENCLATURA, score=0.6),
        Pattern(name="direccion_sector", regex=_SECTOR, score=0.55),
        Pattern(name="direccion_finca", regex=_FINCA, score=0.5),
        Pattern(name="direccion_manzana", regex=_MANZANA, score=0.6),
        Pattern(name="direccion_estrato", regex=_ESTRATO, score=0.45),
    ]

    CONTEXTO = ["dirección", "direccion", "residencia", "domicilio", "reside",
                "barrio", "localidad", "vive"]

    def __init__(self):
        super().__init__(
            supported_entity="DIRECCION_CO",
            patterns=self.PATRONES,
            context=self.CONTEXTO,
            supported_language="es",
        )
