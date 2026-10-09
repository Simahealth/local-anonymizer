"""Dataset de evaluación/entrenamiento a partir de historias clínicas reales.

Toma los PDF exportados del EHR ("=== idcliente N | k registros ===" + notas
"--- fecha ---") y produce, por cada uno, un PDF nuevo y su ground truth en el
formato de tests/evaluacion (nombre, texto, ground_truth):

1. SUSTITUYE los identificadores reales que puede ubicar por datos ficticios
   consistentes (el mismo médico real → el mismo médico ficticio en todo el
   dataset): firmas y avales ("firmado por <nombre> <cargo> registro N cc N"),
   "dr/dra <apellido>", teléfonos, correos (también "usuario gmail com"),
   direcciones, procedencias, idcliente, y nombres de familiares/equipo que el
   detector encuentra con forma inequívoca de nombre.
2. INSERTA datos ficticios del paciente: una cabecera demográfica (en parte de
   los documentos) y frases en la narrativa con el estilo del export
   (minúsculas, sin tildes). La mitad de los nombres NO están en el gazetteer
   del detector, para no inflar el recall.
3. Genera el PDF, lo vuelve a extraer con el ExtractorPDF de la app y verifica
   que cada valor del ground truth aparezca en el texto extraído.

Todo valor ficticio (insertado o sustituto) queda en el ground truth. Lo que
no se pudo ubicar NO: el resultado sigue derivando de historias reales y puede
conservar datos reales residuales → tratarlo como dato sensible (no versionar,
no compartir). Uso:

    python -m tests.evaluacion.generar_dataset_otras_enfermedades \\
        ~/Downloads/pdfs_prueba_otras_enfermedades ~/Documents/dataset_hc_otras_enfermedades
"""

import argparse
import json
import random
import re
import shutil
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

import pymupdf
from spacy.lang.es.stop_words import STOP_WORDS
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from anonimizador.detector import DetectorPII
from anonimizador.extractor import ExtractorPDF
from anonimizador.reconocedores.direccion import ReconocedorDireccion
from anonimizador.reconocedores.nombre_gazetteer import _normalizar, cargar_nombres

SEMILLA = 20261009

# --------------------------------------------------------------------------- #
# Vocabulario ficticio
# --------------------------------------------------------------------------- #

# Mitad en el gazetteer del detector, mitad fuera (nombres afro, indígenas,
# grafías locales): el dataset no debe premiar solo lo que el gazetteer conoce.
NOMBRES_F = [
    "maria fernanda", "laura", "valentina", "luz marina", "diana carolina", "yeimy", "yulieth",
    "xiomara", "leidy johana", "katherin", "ledys", "nayibe", "yurley", "deisy", "marleny",
    "ana milena", "sandra patricia", "yamile", "dayana", "luz dary", "edilma", "rubiela",
    "neyla", "yorladis", "eucaris", "wendy", "zuleima", "yesica", "angie", "mayerly",
]
NOMBRES_M = [
    "juan camilo", "andres felipe", "jhon fredy", "brayan", "wilmer", "dairo", "deiner",
    "carlos alberto", "luis eduardo", "jose david", "yeison", "edwin", "jair", "faiber",
    "anderson", "kevin", "duvan", "harold", "yerson", "nilson", "jhonatan", "elkin",
    "ferney", "arley", "robinson", "eider", "wilson", "fabio", "hermes", "oscar ivan",
]
APELLIDOS = [
    "gomez", "rodriguez", "martinez", "ospina", "restrepo", "cardona", "arango", "zuluaga",
    "quintero", "mosquera", "palacios", "murillo", "renteria", "cuesta", "asprilla", "valoyes",
    "tunubala", "jamioy", "chindoy", "maje", "epieyu", "uriana", "pushaina", "ibarguen",
    "cordoba", "lozano", "perea", "hinestroza", "moreno", "becerra", "sepulveda", "londono",
    "agudelo", "vanegas", "cuero", "angulo", "riascos", "ipia", "yatacue", "guegia",
]
CIUDADES = [
    "bogota", "soacha", "girardot", "fusagasuga", "zipaquira", "villavicencio", "yopal",
    "tunja", "sogamoso", "neiva", "pitalito", "ibague", "espinal", "florencia", "mocoa",
    "pasto", "ipiales", "popayan", "santander de quilichao", "cali", "buenaventura",
    "tulua", "quibdo", "istmina", "medellin", "apartado", "turbo", "monteria", "sincelejo",
    "cartagena", "barranquilla", "santa marta", "riohacha", "valledupar", "cucuta",
    "bucaramanga", "barrancabermeja", "arauca", "san jose del guaviare", "leticia",
]
BARRIOS = [
    "kennedy", "bosa la libertad", "suba rincon", "el tunal", "patio bonito", "las cruces",
    "san cristobal", "la candelaria", "castilla", "el restrepo", "ciudad bolivar",
    "la gaitana", "los alpes", "el porvenir", "villa del rio", "san bernardino",
]
EPS = [
    "Nueva EPS", "Sanitas", "Sura", "Compensar", "Famisanar", "Salud Total", "Coosalud",
    "Mutual Ser", "Emssanar", "Capital Salud", "Asmet Salud", "Cajacopi", "Savia Salud",
]
IPS = [
    "hospital de engativa", "hospital san rafael de pasto", "clinica la estancia",
    "hospital universitario del valle", "hospital de meissen", "esp ese hospital local",
]
ESPECIALIDADES = [
    "neuropediatria", "ortopedia infantil", "genetica", "fisiatria", "cardiologia pediatrica",
    "nutricion", "neumologia pediatrica", "cirugia pediatrica",
]
DOMINIOS = ["gmail com", "hotmail com", "yahoo es", "outlook com"]

# Palabras con las que empieza el cargo en "firmado por <nombre> <cargo>".
PALABRAS_CARGO = {
    "residente", "servicio", "terapia", "trabajo", "neurocirugia", "ortopedia", "neurologia",
    "neuropsicologia", "odontologia", "psicologia", "pediatria", "medicina", "psiquiatria",
    "anestesiologia", "enfermeria", "enfermera", "enfermero", "nutricion", "fisioterapia",
    "fonoaudiologia", "terapeuta", "auxiliar", "jefe", "cirugia", "genetica", "medico",
    "evaluacion", "fisiatria", "cardiologia", "radiologia", "otorrinolaringologia",
    "oftalmologia", "urologia", "infectologia", "neumologia", "gastroenterologia",
    "endocrinologia", "nefrologia", "hematologia", "dermatologia", "instrumentacion",
    "ortesis", "optometria", "coordinador", "coordinadora", "psicologa", "psicologo",
    "nutricionista", "fisioterapeuta", "pediatra", "ortopedista", "anestesiologo",
}
PARENTESCOS = ["madre", "padre", "abuela", "tia", "hermana mayor", "abuelo"]
RELACION = r"(?:madre|padre|mama|papa|hermana|hermano|abuela|abuelo|tia|tio|acudiente|instrumentadora|enfermera|jefe)"
STOP_NOMBRE = {"paciente", "madre", "padre", "refiere", "quien", "con", "del", "los", "las", "por"}

CATEGORIAS = ("nombres", "documentos", "telefonos", "direcciones", "emails", "numeros_registro",
              "ubicaciones", "seguros", "fechas_nacimiento")


# --------------------------------------------------------------------------- #
# Generador de datos ficticios (reproducible, consistente entre documentos)
# --------------------------------------------------------------------------- #

class Ficticio:
    def __init__(self, semilla: int):
        self.r = random.Random(semilla)
        self.nombres_reales: dict[str, str] = {}   # nombre real completo → ficticio
        self.tokens_reales: dict[str, str] = {}    # apellido real → apellido ficticio
        self.numeros: dict[str, str] = {}          # número real → ficticio (misma longitud)
        self.usados: set[str] = set()

    def apellido(self) -> str:
        return self.r.choice(APELLIDOS)

    def persona(self, sexo: str | None = None, n_tokens: int | None = None) -> str:
        sexo = sexo or self.r.choice("FM")
        nombres = self.r.choice(NOMBRES_F if sexo == "F" else NOMBRES_M).split()
        apellidos = [self.apellido(), self.apellido()]
        while apellidos[1] == apellidos[0]:
            apellidos[1] = self.apellido()
        tokens = nombres + apellidos
        if n_tokens:
            tokens = (nombres[:1] + nombres[1:] + apellidos)[:n_tokens] if n_tokens >= 3 \
                else nombres[:1] + apellidos[:n_tokens - 1]
            while len(tokens) < n_tokens:
                tokens.append(self.apellido())
        return " ".join(tokens)

    def digitos(self, n: int, primero: str = "123456789") -> str:
        while True:
            v = self.r.choice(primero) + "".join(self.r.choice("0123456789") for _ in range(n - 1))
            if v not in self.usados:
                self.usados.add(v)
                return v

    def numero_por(self, real: str) -> str:
        """Ficticio estable para un número real (mismo largo y primer dígito si es celular)."""
        if real not in self.numeros:
            self.numeros[real] = self.digitos(len(real), "3" if real.startswith("3") and len(real) == 10 else "123456789")
        return self.numeros[real]

    def celular(self) -> str:
        return "3" + self.r.choice(["00", "01", "04", "10", "12", "13", "14", "15", "17", "18", "20", "23", "50"]) + self.digitos(7, "0123456789")

    def documento(self, menor: bool) -> tuple[str, str, str]:
        """(tipo, número tal cual aparece, número en dígitos)."""
        digitos = self.digitos(10, "1") if menor else self.digitos(self.r.choice([8, 10]), "1789")
        if self.r.random() < 0.4:  # con puntos de miles, como en muchos formularios
            con_puntos = f"{int(digitos):,}".replace(",", ".")
            return ("TI" if menor else "CC"), con_puntos, digitos
        return ("TI" if menor else "CC"), digitos, digitos

    def direccion(self) -> str:
        n = lambda a, b: self.r.randint(a, b)  # noqa: E731
        letra = self.r.choice(["", "", " a", " b", " c"])
        sur = self.r.choice(["", "", " sur", " este"])
        plantillas = [
            f"calle {n(1, 190)}{letra} # {n(1, 120)} - {n(1, 99)}{sur}",
            f"carrera {n(1, 120)}{letra} no {n(1, 190)} {n(1, 99)}{sur}",
            f"cra {n(1, 120)} # {n(1, 190)}{letra} - {n(1, 99)}",
            f"diag {n(1, 90)}{letra} no {n(1, 90)} {n(1, 99)}{sur}",
            f"transversal {n(1, 90)} # {n(1, 90)} - {n(1, 99)} casa {n(1, 60)}",
            f"manzana {n(1, 30)} casa {n(1, 40)}",
        ]
        return self.r.choice(plantillas)

    def correo(self, nombre: str, espaciado: bool) -> str:
        partes = nombre.split()
        usuario = self.r.choice([partes[0] + partes[-1], partes[0][0] + partes[-1], partes[-1] + partes[0]])
        # Sin dígitos si va con espacios ("laura gmail com"): la extracción de la
        # app separa dígito/letra ("laura 96 gmail com") y el valor ya no coincidiría.
        usuario += str(self.r.randint(1, 99)) if not espaciado and self.r.random() < 0.7 else ""
        dominio = self.r.choice(DOMINIOS)
        return f"{usuario} {dominio}" if espaciado else f"{usuario}@{dominio.replace(' ', '.')}"

    def nombre_por(self, real: str) -> str:
        """Nombre ficticio estable para un nombre real (mismo número de palabras).
        Sus apellidos quedan asociados para reemplazar luego 'dr <apellido>'."""
        if real not in self.nombres_reales:
            tokens = real.split()
            ficticio = self.persona(n_tokens=len(tokens))
            # Apellidos reales conocidos → mismos apellidos ficticios (consistencia).
            ft = ficticio.split()
            for i, t in enumerate(tokens):
                if t in self.tokens_reales and i >= 1:
                    ft[i] = self.tokens_reales[t]
            ficticio = " ".join(ft)
            self.nombres_reales[real] = ficticio
            for t_real, t_fict in zip(tokens[1:], ficticio.split()[1:]):
                self.tokens_reales.setdefault(t_real, t_fict)
        return self.nombres_reales[real]

    def apellido_por(self, real: str) -> str:
        if real not in self.tokens_reales:
            self.tokens_reales[real] = self.apellido()
        return self.tokens_reales[real]


# --------------------------------------------------------------------------- #
# Lectura del export
# --------------------------------------------------------------------------- #

@dataclass
class Documento:
    idcliente: str
    n_registros: str
    registros: list[tuple[str, str]]  # (fecha, cuerpo)
    gt: dict[str, set[str]] = field(default_factory=lambda: {c: set() for c in CATEGORIAS})

    def cuerpo_total(self) -> str:
        return "\n".join(c for _, c in self.registros)


_SPAN_FIRMA = re.compile(r"(?:firmado|avalado) ?por.{0,200}?(?:cc|registro) ?\d{5,11}(?: ?cc ?\d{5,11})?")
_CARGO_PEGADO = re.compile(
    r"(?<=[a-zñ]{3})(" + "|".join(sorted((w for w in PALABRAS_CARGO if len(w) >= 5), key=len, reverse=True)) + r")\b"
)


def despegar_firmas(texto: str) -> str:
    """El export pega palabras dentro de las firmas ("firmado porluz andrea
    pulido morenotrabajo socialregistro 52996460"). Se separan SOLO dentro de
    la firma (en el texto clínico "fisioterapia" no debe partirse)."""
    def arreglar(m):
        f = m.group(0)
        f = re.sub(r"\b(firmado|avalado) ?por(?=[a-zñ])", r"\1 por ", f)
        f = re.sub(r"(?<=[a-zñ])(registro|cc)(?= ?\d)", r" \1", f)
        f = re.sub(r"\b(registro|cc)(?=\d)", r"\1 ", f)
        f = re.sub(r"(?<=\d)(cc|registro)\b", r" \1", f)
        return _CARGO_PEGADO.sub(r" \1", f)
    return _SPAN_FIRMA.sub(arreglar, texto)


def leer(pdf: Path) -> Documento:
    lineas = "\n".join(p.get_text() for p in pymupdf.open(pdf)).splitlines()
    m = re.match(r"=== idcliente (\d+) \| (\d+) registros ===", lineas[0].strip())
    if not m:
        raise ValueError(f"{pdf.name}: cabecera inesperada")
    registros, fecha, cuerpo = [], None, []
    for linea in lineas[1:]:
        f = re.match(r"^--- (.+) ---$", linea.strip())
        if f:
            if fecha is not None:
                registros.append((fecha, despegar_firmas(" ".join(" ".join(cuerpo).split()))))
            fecha, cuerpo = f.group(1), []
        elif linea.strip():
            cuerpo.append(linea.strip())
    if fecha is not None:
        registros.append((fecha, despegar_firmas(" ".join(" ".join(cuerpo).split()))))
    return Documento(m.group(1), m.group(2), registros)


# --------------------------------------------------------------------------- #
# Sustitución de datos reales
# --------------------------------------------------------------------------- #

_FIRMA = re.compile(r"\b(firmado por|avalado por) ?((?:[a-zñ]+ ){1,12}?)(?=registro \d|cc \d|firmado por|avalado por|$)")
_DR = re.compile(r"\b(dr|dra|doctor|doctora)\.? ((?:[a-zñ]+)(?: [a-zñ]+){0,2})")


class Sustituidor:
    def __init__(self, ficticio: Ficticio, cargos: Counter, tokens_nombre: set[str]):
        self.f = ficticio
        self.cargos = cargos
        self.tokens_nombre = tokens_nombre  # gazetteer + tokens de nombres de firmas
        self.detector = DetectorPII()
        self.direcciones = ReconocedorDireccion()
        self.numeros_reales: set[str] = set()  # todos los identificadores numéricos del corpus
        self.ids_reales: set[str] = set()       # los que van tras registro/cc/ti

    def separar(self, tokens: list[str]) -> int:
        """Cuántos tokens iniciales son el nombre (el resto es el cargo)."""
        mejor, n_mejor = 0, 0
        for k in range(1, min(5, len(tokens))):
            freq = self.cargos[" ".join(tokens[k:])]
            if freq > mejor:
                mejor, n_mejor = freq, k
        if mejor >= 3:
            return n_mejor
        for k, t in enumerate(tokens):
            if t in PALABRAS_CARGO and k >= 1:
                return k
        return min(len(tokens), 3)

    def firmas(self, texto: str, gt) -> str:
        def repl(m):
            tokens = m.group(2).split()
            k = self.separar(tokens)
            real = " ".join(tokens[:k])
            if k < 2 and not (k == 1 and tokens[0] in self.tokens_nombre):
                return m.group(0)
            ficticio = self.f.nombre_por(real)
            gt["nombres"].add(ficticio)
            return f"{m.group(1)} {ficticio} {' '.join(tokens[k:])}{' ' if k < len(tokens) else ''}"
        texto = _FIRMA.sub(repl, texto)

        def repl_num(m):
            ficticio = self.f.numero_por(m.group(2))
            gt["numeros_registro" if m.group(1) == "registro" else "documentos"].add(ficticio)
            return f"{m.group(1)} {ficticio}"
        return re.sub(r"(?<![a-z])(registro|cc|ti|c\.c\.?) (\d{5,11})\b", repl_num, texto)

    def doctores(self, texto: str, gt) -> str:
        def repl(m):
            # Tras "dr/dra" la 1.ª palabra es un apellido salvo que sea palabra
            # común o un cargo ("dr de turno", "dra quien"); las siguientes,
            # solo si tienen forma de nombre conocida.
            tokens = []
            for k, t in enumerate(m.group(2).split()):
                comun = t in STOP_WORDS or t in STOP_NOMBRE or t in PALABRAS_CARGO or len(t) < 3
                if (k == 0 and not comun) or (k > 0 and t in self.tokens_nombre and not comun):
                    tokens.append(t)
                else:
                    break
            if not tokens:
                return m.group(0)
            ficticios = [self.f.apellido_por(t) for t in tokens]
            gt["nombres"].add(" ".join(ficticios))
            resto = m.group(2).split()[len(tokens):]
            return f"{m.group(1)} {' '.join(ficticios)}" + (" " + " ".join(resto) if resto else "")
        return _DR.sub(repl, texto)

    def contacto(self, texto: str, gt) -> str:
        ya_ficticios = set(self.f.numeros.values())

        def tel(m):
            # Un número que ya es un sustituto (p. ej. un registro de 10 dígitos
            # que empieza por 3) o que sigue a "registro"/"cc" no es un teléfono.
            if m.group(0) in ya_ficticios or re.search(r"(registro|cc|ti|c\.c\.?) $", texto[max(0, m.start() - 10):m.start()]):
                return m.group(0)
            ficticio = self.f.numero_por(m.group(0))
            gt["telefonos"].add(ficticio)
            return ficticio
        texto = re.sub(r"\b3\d{9}\b|\b60\d{8}\b", tel, texto)
        texto = re.sub(
            r"\b(telefono|tel|celular|fijo|contacto)( (?:fijo )?)(\d{7})\b",
            lambda m: m.group(1) + m.group(2) + tel(re.match(r"\d+", m.group(3))), texto,
        )

        def correo(m, espaciado):
            ficticio = self.f.correo(self.f.persona(), espaciado)
            gt["emails"].add(ficticio)
            return ficticio
        texto = re.sub(r"\b[\w.]+@[\w-]+(?:\.[\w-]+)+\b", lambda m: correo(m, False), texto)
        texto = re.sub(r"\b[a-z0-9._]{3,} (?:gmail|hotmail|yahoo|outlook|live|icloud|une|etb) (?:com|es|net)(?: co)?\b",
                       lambda m: correo(m, True), texto)
        texto = re.sub(r"\b(mail|correo|email|correo electronico) ([a-z0-9._]{3,} [a-z0-9]{2,} (?:org|com|net|edu)(?: co)?)\b",
                       lambda m: m.group(1) + " " + correo(m, True), texto)
        return texto

    def direcciones_(self, texto: str, gt) -> str:
        res = [r for r in self.direcciones.analyze(texto, ["DIRECCION_CO"])
               if r.score >= 0.6 and re.search(r"\d", texto[r.start:r.end])]
        for r in sorted(res, key=lambda r: r.start, reverse=True):
            ficticia = self.f.direccion()
            gt["direcciones"].add(ficticia)
            texto = texto[:r.start] + ficticia + texto[r.end:]
        return texto

    def procedencia(self, texto: str, gt) -> str:
        ciudades = sorted(CIUDADES, key=len, reverse=True)
        patron = re.compile(r"\b(procedente de|natural de|procedencia|vive en|residente en|reside en|oriund[oa] de|proc de)( (?:y procedente de )?)("
                            + "|".join(map(re.escape, ciudades + ["huila", "cundinamarca", "boyaca", "tolima", "meta", "casanare", "narino", "cauca", "valle", "choco", "antioquia", "cordoba", "sucre", "bolivar", "cesar", "putumayo", "caqueta", "arauca", "guaviare", "amazonas"]))
                            + r")((?: (?:" + "|".join(map(re.escape, ciudades + ["huila", "cundinamarca", "boyaca", "tolima", "meta", "casanare", "narino", "cauca", "valle", "choco", "antioquia", "caqueta", "putumayo"])) + r"))?)\b")

        def repl(m):
            ficticia = self.f.r.choice(CIUDADES)
            gt["ubicaciones"].add(ficticia)
            return f"{m.group(1)}{m.group(2)}{ficticia}"
        return patron.sub(repl, texto)

    def barrido_nombres(self, texto: str, gt) -> str:
        """Nombres que el detector ve y que tienen forma inequívoca de nombre
        (familiares, equipo quirúrgico…) → ficticios."""
        propios = {t for v in gt["nombres"] for t in v.split()}
        candidatos = set()
        for valor in self.detector.detectar(texto)["nombres"]:
            tokens = valor.lower().split()
            if not tokens or any(t in propios for t in tokens) or any(not t.isalpha() for t in tokens):
                continue
            if any(t in STOP_NOMBRE or t in PALABRAS_CARGO or t in STOP_WORDS for t in tokens):
                continue
            conocidos = sum(t in self.tokens_nombre for t in tokens)
            if 2 <= len(tokens) <= 4 and conocidos >= 2:
                candidatos.add(valor)
        # Un solo nombre de pila tras un parentesco/rol ("instrumentadora sandra").
        for m in re.finditer(rf"\b{RELACION} ([a-zñ]+)\b", texto):
            if (m.group(1) in self.tokens_nombre and m.group(1) not in propios
                    and m.group(1) not in STOP_NOMBRE and m.group(1) not in STOP_WORDS and len(m.group(1)) >= 3):
                candidatos.add(m.group(1))
        for real in sorted(candidatos, key=len, reverse=True):
            ficticio = self.f.nombre_por(real.lower()) if " " in real else self.f.persona().split()[0]
            patron = r"(?<![\w])" + re.escape(real) + r"(?![\w])"
            if re.search(patron, texto):
                texto = re.sub(patron, ficticio, texto)
                gt["nombres"].add(ficticio)
        return texto

    def residuos(self, texto: str, gt) -> str:
        """Toda aparición suelta de un número o nombre real ya mapeado (p. ej. el
        registro sin la palabra "registro" delante de una firma) → su ficticio."""
        for real in self.numeros_reales:
            if re.search(rf"\b{real}\b", texto):
                ficticio = self.f.numero_por(real)
                texto = re.sub(rf"\b{real}\b", ficticio, texto)
                gt["telefonos" if len(real) == 10 and real.startswith("3") and real not in self.ids_reales
                   else "documentos"].add(ficticio)
        for real, ficticio in sorted(self.f.nombres_reales.items(), key=lambda x: -len(x[0])):
            patron = r"(?<![\w])" + re.escape(real) + r"(?![\w])"
            if " " in real and re.search(patron, texto):
                texto = re.sub(patron, ficticio, texto)
                gt["nombres"].add(ficticio)
        return texto

    def aplicar(self, doc: Documento, id_ficticio: str) -> None:
        textos = []
        for fecha, cuerpo in doc.registros:
            cuerpo = cuerpo.replace(doc.idcliente, id_ficticio)
            for paso in (self.firmas, self.doctores, self.contacto, self.direcciones_, self.procedencia):
                cuerpo = paso(cuerpo, doc.gt)
            textos.append((fecha, cuerpo))
        # Barrido sobre el documento entero (consistencia entre notas).
        unido = "\n\u2063\n".join(c for _, c in textos)
        unido = self.barrido_nombres(unido, doc.gt)
        unido = self.residuos(unido, doc.gt)
        doc.registros = [(f, c) for (f, _), c in zip(textos, unido.split("\n\u2063\n"))]
        doc.idcliente = id_ficticio


# --------------------------------------------------------------------------- #
# Inserción de datos del paciente
# --------------------------------------------------------------------------- #

def _huecos(cuerpo: str) -> list[int]:
    """Índices de palabra donde se puede insertar una frase sin partir un nombre."""
    prohibido = [(m.start(), m.end() + 1) for m in re.finditer(
        r"\b(?:firmado por|avalado por) ?.*?(?:cc \d+|$)|\b(?:dr|dra|doctor|doctora)\.? (?:[a-zñ]+ ?){1,3}", cuerpo)]
    huecos, pos = [], 0
    for j, palabra in enumerate(cuerpo.split(" ")):
        if not any(a < pos < b for a, b in prohibido):
            huecos.append(j)
        pos += len(palabra) + 1
    return huecos + [len(cuerpo.split(" "))] if not huecos else huecos


def insertar(doc: Documento, f: Ficticio) -> dict:
    texto = doc.cuerpo_total()
    sexo = "F" if re.search(r"\b(femenin[oa]|genero femenino)\b", texto) else \
        "M" if re.search(r"\b(masculino|genero masculino)\b", texto) else f.r.choice("FM")
    edad = re.search(r"\bpaciente de (\d{1,2}) anos", texto)
    edad = int(edad.group(1)) if edad else f.r.randint(1, 17)
    menor = edad < 18
    paciente = f.persona(sexo)
    madre = f.persona("F")
    tipo, doc_txt, doc_dig = f.documento(menor)
    tipo_m, cc_madre, _ = f.documento(False)
    tel, tel2 = f.celular(), f.celular()
    direccion, barrio, ciudad = f.direccion(), f.r.choice(BARRIOS), f.r.choice(CIUDADES)
    eps = f.r.choice(EPS)
    correo = f.correo(madre, espaciado=f.r.random() < 0.5)
    nacimiento = date(2026 - edad, 1, 1) + timedelta(days=f.r.randint(0, 364))
    dr = f"{f.apellido()} {f.apellido()}"
    dra = f.persona("F", n_tokens=3)
    parentesco = f.r.choice(PARENTESCOS)
    acudiente = f.persona("F" if parentesco in ("madre", "abuela", "tia", "hermana mayor") else "M")
    gt = doc.gt
    gt["nombres"] |= {paciente, madre, acudiente, dr, dra}
    gt["documentos"] |= {doc_txt, cc_madre}
    gt["telefonos"] |= {tel, tel2}
    gt["direcciones"].add(direccion)
    gt["emails"].add(correo)
    gt["ubicaciones"].add(ciudad)
    gt["seguros"].add(eps)

    frases = [
        f"paciente {paciente} identificado con {tipo.lower()} {doc_txt}",
        f"en compania de su madre {madre} cc {cc_madre}",
        f"datos de contacto madre {madre} celular {tel}",
        f"acudiente {acudiente} ({parentesco}) telefono {tel2}",
        f"reside en {direccion} barrio {barrio} {ciudad}",
        f"correo electronico de contacto {correo}",
        f"se comenta caso con dr {dr} de {f.r.choice(ESPECIALIDADES)} quien indica continuar manejo",
        f"remitido por dra {dra} de {f.r.choice(IPS)}",
        f"se intenta comunicacion telefonica al {tel} sin respuesta",
    ]
    f.r.shuffle(frases)
    n = f.r.randint(3, min(6, len(frases)))
    elegidos = frases[:n]
    # Lo no insertado sale del ground truth (las variables se generaron todas).
    insertado = " ".join(elegidos)
    cabecera = None
    if f.r.random() < 0.6:
        nombre_t = paciente.title()
        cabecera = (
            f"Paciente: {nombre_t} | {tipo}: {doc_txt} | Fecha de nacimiento: {nacimiento:%d/%m/%Y} | EPS: {eps}\n"
            f"Dirección: {direccion.title()}, barrio {barrio.title()}, {ciudad.title()} | Teléfono: {tel} | "
            f"Acudiente: {madre.title()} (madre) cel. {tel2}"
        )
        gt["nombres"].add(nombre_t)
        gt["nombres"].add(madre.title())
        gt["direcciones"].add(direccion.title())
        gt["fechas_nacimiento"].add(f"{nacimiento:%d/%m/%Y}")
        insertado += " " + cabecera.lower()
    for cat in ("nombres", "documentos", "telefonos", "direcciones", "emails", "ubicaciones", "seguros"):
        gt[cat] = {v for v in gt[cat] if v.lower() in insertado.lower() or v.lower() in texto.lower()
                   or cat in ("ubicaciones",) and v in texto}
    # Cada frase va a una nota al azar, en un límite de palabra del texto
    # original de esa nota (todas a la vez: una frase nunca cae dentro de otra).
    # Tampoco dentro de una firma o de "dr <apellido>": partiría el nombre.
    por_registro: dict[int, list[tuple[int, str]]] = {}
    for frase in elegidos:
        i = f.r.randrange(len(doc.registros))
        por_registro.setdefault(i, []).append((f.r.choice(_huecos(doc.registros[i][1])), frase))
    for i, inserciones in por_registro.items():
        fecha, cuerpo = doc.registros[i]
        palabras = cuerpo.split(" ")
        for j, frase in sorted(inserciones, reverse=True):
            palabras[j:j] = [frase]
        doc.registros[i] = (fecha, " ".join(palabras))
    return {"cabecera": cabecera, "frases": len(elegidos)}


# --------------------------------------------------------------------------- #
# Escritura
# --------------------------------------------------------------------------- #

_ESTILO = {
    "titulo": ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=10, leading=13, spaceAfter=6),
    "cabecera": ParagraphStyle("c", fontName="Helvetica", fontSize=9, leading=12, spaceAfter=8),
    "fecha": ParagraphStyle("f", fontName="Helvetica-Bold", fontSize=8.5, leading=11, spaceBefore=4),
    "cuerpo": ParagraphStyle("b", fontName="Helvetica", fontSize=8.5, leading=11),
}


def escribir_pdf(doc: Documento, cabecera: str | None, ruta: Path) -> None:
    pdf = SimpleDocTemplate(str(ruta), pagesize=letter, leftMargin=50, rightMargin=50,
                            topMargin=45, bottomMargin=45, title="", author="")
    flujo = [Paragraph(escape(f"=== idcliente {doc.idcliente} | {doc.n_registros} registros ==="), _ESTILO["titulo"])]
    if cabecera:
        flujo.append(Paragraph(escape(cabecera).replace("\n", "<br/>"), _ESTILO["cabecera"]))
    for fecha, cuerpo in doc.registros:
        flujo += [Paragraph(escape(f"--- {fecha} ---"), _ESTILO["fecha"]),
                  Paragraph(escape(cuerpo), _ESTILO["cuerpo"]), Spacer(1, 3)]
    pdf.build(flujo)


def normalizar(s: str) -> str:
    return " ".join(s.lower().split())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("origen", type=Path)
    ap.add_argument("destino", type=Path)
    ap.add_argument("--semilla", type=int, default=SEMILLA)
    ap.add_argument("--solo-base", action="store_true",
                    help="Solo la limpieza mecánica (base/*.txt) para que la completen los agentes")
    ap.add_argument("--finalizar-con", type=Path, metavar="EDICIONES",
                    help="Aplica las ediciones JSON de los agentes sobre destino/base y genera PDFs + GT")
    args = ap.parse_args()
    if args.finalizar_con:
        finalizar(args.destino, args.finalizar_con)
        return

    pdfs = sorted(args.origen.glob("*.pdf"))
    documentos = [leer(p) for p in pdfs]

    # Cargos: lo que sigue al nombre en las firmas se repite entre médicos.
    cargos, tokens_firmas = Counter(), set()
    for d in documentos:
        for m in _FIRMA.finditer(d.cuerpo_total()):
            tokens = m.group(2).split()
            for k in range(1, min(5, len(tokens))):
                cargos[" ".join(tokens[k:])] += 1
    f = Ficticio(args.semilla)
    sust = Sustituidor(f, cargos, set())
    for d in documentos:
        for m in _FIRMA.finditer(d.cuerpo_total()):
            tokens = m.group(2).split()
            tokens_firmas |= set(tokens[:sust.separar(tokens)])
    # Sin stop words: el gazetteer trae "de", "la"… de apellidos compuestos, y
    # reemplazar "de" por un nombre destruye el texto.
    sust.tokens_nombre = {t for t in cargar_nombres() | tokens_firmas
                          if len(t) >= 3 and t not in STOP_WORDS} - STOP_NOMBRE - PALABRAS_CARGO
    for d in documentos:
        t = d.cuerpo_total()
        ids = set(re.findall(r"(?<![a-z])(?:registro|cc|ti|c\.c\.?) ?(\d{5,11})\b", t))
        sust.ids_reales |= ids
        sust.numeros_reales |= ids | set(re.findall(r"\b3\d{9}\b|\b60\d{8}\b", t)) | {d.idcliente}
    f.usados |= sust.numeros_reales  # ningún ficticio puede coincidir con un número real

    if args.destino.exists():
        shutil.rmtree(args.destino)
    args.destino.mkdir(parents=True)

    orden = list(range(len(documentos)))
    f.r.shuffle(orden)  # el número de caso no delata el orden de los originales
    base_dir = args.destino / "base"
    base_dir.mkdir()
    for n, i in enumerate(orden, 1):
        d = documentos[i]
        nombre = f"hc_oe_{n:03d}"
        sust.aplicar(d, f.digitos(6))
        cabecera = None
        if not args.solo_base:
            cabecera = insertar(d, f)["cabecera"]
        guardar_base(base_dir, nombre, d, cabecera)

    if not args.solo_base:
        finalizar(args.destino, None)


# --------------------------------------------------------------------------- #
# Etapas: base (texto limpio para los agentes) y final (ediciones → PDF + GT)
# --------------------------------------------------------------------------- #

def texto_legible(d: Documento, cabecera: str | None) -> str:
    partes = [f"=== idcliente {d.idcliente} | {d.n_registros} registros ==="]
    if cabecera:
        partes.append(cabecera)
    partes += [f"--- {fecha} ---\n{cuerpo}" for fecha, cuerpo in d.registros]
    return "\n".join(partes) + "\n"


def guardar_base(base_dir: Path, nombre: str, d: Documento, cabecera: str | None) -> None:
    (base_dir / f"{nombre}.json").write_text(json.dumps({
        "idcliente": d.idcliente, "n_registros": d.n_registros, "cabecera": cabecera,
        "registros": d.registros, "ground_truth": {c: sorted(v) for c, v in d.gt.items() if v},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    (base_dir / f"{nombre}.txt").write_text(texto_legible(d, cabecera), encoding="utf-8")


def _buscar(registros: list[list[str]], fragmento: str) -> tuple[int, int] | None:
    """(índice de registro, offset de fin) de `fragmento`, tolerando mayúsculas y espacios."""
    patron = re.compile(r"\s+".join(map(re.escape, fragmento.split())), re.IGNORECASE)
    for i, (_, cuerpo) in enumerate(registros):
        m = patron.search(cuerpo)
        if m:
            return i, m.end()
    return None


def aplicar_ediciones(d: Documento, ediciones: dict, informe: Counter) -> None:
    """Aplica lo que propuso un agente: reemplazos de datos reales residuales e
    inserciones de datos ficticios. Lo que no se pueda ubicar se descarta."""
    registros = [list(r) for r in d.registros]
    # El más largo primero: "isabella leon" antes que "isabella".
    reemplazos = sorted(ediciones.get("reemplazos", []), key=lambda r: -len(str(r.get("original", ""))))
    for r in reemplazos:
        original, nuevo, cat = r.get("original", "").strip(), r.get("nuevo", "").strip(), r.get("categoria")
        if not original or not nuevo or cat not in CATEGORIAS or len(original) < 3:
            informe["reemplazos_invalidos"] += 1
            continue
        # Los agentes copian del .txt con líneas cortadas: cualquier espacio en blanco vale.
        patron = re.compile(r"(?<![\w])" + r"\s+".join(map(re.escape, original.split())) + r"(?![\w])",
                            re.IGNORECASE)
        n = 0
        for reg in registros:
            reg[1], k = patron.subn(nuevo, reg[1])
            n += k
        if n:
            d.gt[cat].add(nuevo)
            informe["reemplazos_aplicados"] += 1
        else:
            informe["reemplazos_no_encontrados"] += 1
    for ins in ediciones.get("inserciones", []):
        texto, datos = ins.get("texto", "").strip(), ins.get("datos", [])
        validos = [x for x in datos if x.get("categoria") in CATEGORIAS and x.get("valor")
                   and normalizar(x["valor"]) in normalizar(texto)]
        lugar = _buscar(registros, ins.get("despues_de", ""))
        if not texto or not lugar or len(validos) != len(datos):
            informe["inserciones_descartadas"] += 1
            continue
        i, fin = lugar
        registros[i][1] = registros[i][1][:fin] + " " + texto + registros[i][1][fin:]
        for x in validos:
            d.gt[x["categoria"]].add(x["valor"].strip())
        informe["inserciones_aplicadas"] += 1
    d.registros = [tuple(r) for r in registros]


def finalizar(destino: Path, ediciones_dir: Path | None) -> None:
    base_dir = destino / "base"
    pdf_dir, casos_dir = destino / "pdfs", destino / "datos_hc_otras_enfermedades"
    for carpeta in (pdf_dir, casos_dir):
        if carpeta.exists():
            shutil.rmtree(carpeta)
        carpeta.mkdir()
    extractor = ExtractorPDF()
    faltantes, totales, informe = [], Counter(), Counter()
    for ruta_base in sorted(base_dir.glob("*.json")):
        nombre = ruta_base.stem
        b = json.loads(ruta_base.read_text(encoding="utf-8"))
        d = Documento(b["idcliente"], b["n_registros"], [tuple(r) for r in b["registros"]])
        for c, v in b["ground_truth"].items():
            d.gt[c] = set(v)
        if ediciones_dir:
            ruta_ed = ediciones_dir / f"{nombre}.json"
            if ruta_ed.exists():
                try:
                    aplicar_ediciones(d, json.loads(ruta_ed.read_text(encoding="utf-8")), informe)
                    informe["documentos_editados"] += 1
                except (ValueError, AttributeError, TypeError):
                    informe["ediciones_ilegibles"] += 1
            else:
                informe["documentos_sin_ediciones"] += 1
        ruta = pdf_dir / f"{nombre}.pdf"
        escribir_pdf(d, b.get("cabecera"), ruta)
        texto = extractor.extraer(ruta)
        plano = normalizar(texto)
        gt = {}
        for c, valores in d.gt.items():
            # Un valor pegado ("tel6104827") sale de la extracción como "tel 6104827":
            # se etiqueta en la forma en que lo ve la app.
            ajustados = {v if normalizar(v) in plano else extractor._separar_digito_letra(v) for v in valores}
            presentes = sorted(v for v in ajustados if normalizar(v) in plano)
            faltantes += [(nombre, c, v) for v in ajustados if normalizar(v) not in plano]
            if presentes:
                gt[c] = presentes
                totales[c] += len(presentes)
        (casos_dir / f"{nombre}.json").write_text(json.dumps({
            "nombre": nombre,
            "descripcion": "HC real del export (otras enfermedades) con identificadores reales "
                           "sustituidos por ficticios y datos de paciente insertados.",
            "texto": texto,
            "ground_truth": gt,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    resumen = {"documentos": len(list(base_dir.glob("*.json"))), "valores_por_categoria": dict(totales),
               "valores_descartados_no_presentes_en_pdf": len(faltantes), "ediciones": dict(informe)}
    (destino / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2))
    print(json.dumps(resumen, ensure_ascii=False, indent=2))
    for x in faltantes[:20]:
        print("  no encontrado:", x)


if __name__ == "__main__":
    main()
