import re
from dataclasses import dataclass

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


@dataclass(frozen=True, order=True)
class Tramo:
    """Fragmento [inicio, fin) del texto original que se oculta con la etiqueta
    de `categoria`. Los offsets son índices de str de Python (code points)."""

    inicio: int
    fin: int
    categoria: str


def aplicar(texto: str, tramos: list[Tramo]) -> str:
    """Texto anonimizado: cada tramo (ordenados, sin solaparse) → su etiqueta."""
    partes, cursor = [], 0
    for t in sorted(tramos):
        partes += [texto[cursor:t.inicio], ETIQUETAS_PII[t.categoria]]
        cursor = t.fin
    return "".join(partes) + texto[cursor:]


class Reemplazador:
    """
    Calcula qué tramos del texto se ocultan y con qué etiqueta.

    Trabaja por posiciones, no por sustitución secuencial: primero se ubican
    TODAS las apariciones de todos los valores (palabra completa, sin distinguir
    mayúsculas) y los tramos que se solapan se fusionan en uno solo, que
    lleva la etiqueta de la categoría más específica. Reemplazar valor por valor
    rompía los solapes parciales: si spaCy marcaba "Cundinamarca\nDirección: Cra
    45C N" y se reemplazaba primero, la dirección "Cra 45C N° 20-98" ya no
    existía entera en el texto y "° 20-98" quedaba a la vista.

    Además, cada palabra de un nombre de 2+ palabras se oculta también donde
    aparezca sola con mayúscula inicial ("…la paciente Gómez refiere…"): si el
    detector vio el nombre completo una vez, esas palabras ya son PII confirmada.

    El resultado son `Tramo`s sobre el texto ORIGINAL: el visor de revisión los
    muestra, el usuario los corrige y `aplicar` produce el texto anonimizado.
    """

    def reemplazar(self, texto: str, pii: dict[str, set[str]]) -> str:
        """Retorna el texto con todos los valores de PII sustituidos por etiquetas."""
        return aplicar(texto, self.calcular_tramos(texto, pii))

    def calcular_tramos(self, texto: str, pii: dict[str, set[str]]) -> list[Tramo]:
        prioridad = {cat: i for i, cat in enumerate(_ORDEN_REEMPLAZO)}
        crudos = self._apariciones(texto, pii) + self._propagacion(texto, pii.get("nombres", set()))
        crudos.sort(key=lambda t: (t.inicio, -t.fin))

        fusionados: list[Tramo] = []
        for t in crudos:
            previo = fusionados[-1] if fusionados else None
            if previo and t.inicio < previo.fin:
                # Solape: une los dos tramos; gana la categoría más específica.
                categoria = min(previo.categoria, t.categoria, key=lambda c: prioridad.get(c, 99))
                fusionados[-1] = Tramo(previo.inicio, max(previo.fin, t.fin), categoria)
            elif (
                previo and previo.categoria == t.categoria == "nombres"
                and re.fullmatch(r"[ \t]+", texto[previo.fin:t.inicio])
            ):
                # "Juan" + " " + "Pérez" detectados por separado → un solo [NOMBRE].
                fusionados[-1] = Tramo(previo.inicio, t.fin, "nombres")
            else:
                fusionados.append(t)
        return fusionados

    def _apariciones(self, texto: str, pii: dict[str, set[str]]) -> list[Tramo]:
        """Cada aparición de cada valor detectado."""
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
                        tramos.append(Tramo(m.start(), m.end(), categoria))
        return tramos

    def _propagacion(self, texto: str, nombres: set[str]) -> list[Tramo]:
        palabras = {
            p
            for nombre in nombres if len(nombre.split()) >= 2
            for p in re.findall(r"[^\W\d_]{3,}", nombre)
            if p.lower() not in _NO_PROPAGAR
        }
        tramos = []
        for palabra in palabras:
            # Solo con inicial mayúscula: "Blanco" (apellido) sí, "tejido blanco" no
            # (el lookahead va fuera del `(?i:…)` para que sí distinga mayúsculas).
            patron = r"(?<!\w)(?=[A-ZÁÉÍÓÚÜÑ])(?i:" + re.escape(palabra) + r")(?!\w)"
            tramos += [Tramo(m.start(), m.end(), "nombres") for m in re.finditer(patron, texto)]
        return tramos
