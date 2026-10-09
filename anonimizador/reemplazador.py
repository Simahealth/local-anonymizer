import re

from spacy.lang.es.stop_words import STOP_WORDS

from .detector import ETIQUETAS_PII

# Prefijos de documento que deben eliminarse junto con el número.
_PREFIJOS_DOCUMENTO = (
    r"(?:CC\.?|C\.C\.?|T\.I\.?|TI\.?|[Cc][eé]dula|[Dd]ocumento\s+de\s+[Ii]dentidad)"
    r"\s*:?\s*"
)

# Prioridad al fusionar tramos solapados (o el mismo valor en dos categorías): las
# más específicas (por patrón) ganan sobre las amplias de NER.
_ORDEN_REEMPLAZO = [
    "emails",
    "documentos",
    "telefonos",
    "seguros",
    "numeros_registro",
    "fechas_nacimiento",
    "fechas",
    "edades",
    "nombres",
    "direcciones",
    "ubicaciones",
]

# Palabras de un nombre que no identifican a nadie solas: no se propagan.
_NO_PROPAGAR = {"dr", "dra", "doctor", "doctora", "sr", "sra"} | STOP_WORDS


def _patron_literal(valor: str) -> str:
    """Patrón de `valor` como palabra completa: no reemplaza dentro de otra
    palabra ("Cali" no toca "Calidad"; el número "21" no toca "2021")."""
    patron = re.escape(valor)
    if re.match(r"\w", valor):
        patron = r"(?<!\w)" + patron
    if re.search(r"\w$", valor):
        patron += r"(?!\w)"
    return patron


class Reemplazador:
    """
    Sustituye los valores de PII detectados por sus etiquetas correspondientes.

    Trabaja por posiciones, no por sustitución secuencial: primero se ubican
    TODAS las apariciones de todos los valores (palabra completa, sin distinguir
    mayúsculas) y los tramos que se solapan se fusionan en uno solo, que
    lleva la etiqueta de la categoría más específica. Reemplazar valor por valor
    rompía los solapes parciales: si spaCy marcaba "Cundinamarca\nDirección: Cra
    45C N" y se reemplazaba primero, la dirección "Cra 45C N° 20-98" ya no
    existía entera en el texto y "° 20-98" quedaba a la vista.

    Después, cada palabra de un nombre de 2+ palabras se redacta también donde
    aparezca sola con mayúscula inicial ("…la paciente Gómez refiere…"): si el
    detector vio el nombre completo una vez, esas palabras ya son PII confirmada.
    """

    def reemplazar(self, texto: str, pii: dict[str, set[str]]) -> str:
        """Retorna el texto con todos los valores de PII sustituidos por etiquetas."""
        tramos = sorted(self._tramos(texto, pii))
        partes, cursor = [], 0
        i = 0
        while i < len(tramos):
            ini, fin, prioridad, categoria = tramos[i]
            # Fusiona todo lo que se solapa con [ini, fin); gana la categoría más específica.
            while i + 1 < len(tramos) and tramos[i + 1][0] < fin:
                i += 1
                fin = max(fin, tramos[i][1])
                if tramos[i][2] < prioridad:
                    prioridad, categoria = tramos[i][2], tramos[i][3]
            partes += [texto[cursor:ini], ETIQUETAS_PII[categoria]]
            cursor = fin
            i += 1
        texto = "".join(partes) + texto[cursor:]

        texto = self._propagar_nombres(texto, pii.get("nombres", set()))
        return self._colapsar(texto, ETIQUETAS_PII["nombres"])

    def _tramos(self, texto: str, pii: dict[str, set[str]]) -> list[tuple[int, int, int, str]]:
        """(inicio, fin, prioridad, categoría) de cada aparición de cada valor."""
        prioridad = {cat: i for i, cat in enumerate(_ORDEN_REEMPLAZO)}
        tramos = []
        for categoria, valores in pii.items():
            for valor in valores:
                if not valor.strip():
                    continue
                patrones = [_patron_literal(valor)]
                if categoria == "documentos":
                    # Con su prefijo: "CC: 12345678" → "[DOCUMENTO]", no "CC: [DOCUMENTO]".
                    patrones.append(_PREFIJOS_DOCUMENTO + re.escape(valor))
                for patron in patrones:
                    for m in re.finditer(patron, texto, flags=re.IGNORECASE):
                        tramos.append((m.start(), m.end(), prioridad.get(categoria, 99), categoria))
        return tramos

    def _propagar_nombres(self, texto: str, nombres: set[str]) -> str:
        etiqueta = ETIQUETAS_PII["nombres"]
        palabras = {
            p
            for nombre in nombres if len(nombre.split()) >= 2
            for p in re.findall(r"[^\W\d_]{3,}", nombre)
            if p.lower() not in _NO_PROPAGAR
        }
        for palabra in sorted(palabras, key=len, reverse=True):
            # Solo con inicial mayúscula: "Blanco" (apellido) sí, "tejido blanco" no.
            # (el lookahead va fuera del `(?i:…)` para que sí distinga mayúsculas).
            patron = r"(?<!\w)(?=[A-ZÁÉÍÓÚÜÑ])(?i:" + re.escape(palabra) + r")(?!\w)"
            texto = re.sub(patron, etiqueta, texto)
        return texto

    @staticmethod
    def _colapsar(texto: str, etiqueta: str) -> str:
        """'[NOMBRE] [NOMBRE]' (restos de reemplazos parciales) → '[NOMBRE]'."""
        e = re.escape(etiqueta)
        return re.sub(rf"{e}(?:[ \t]+{e})+", etiqueta, texto)
