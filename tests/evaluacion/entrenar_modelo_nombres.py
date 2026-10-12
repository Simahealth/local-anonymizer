"""Entrena el modelo de nombres (NER de spaCy, CPU) con los datasets de evaluación.

En exports todo en minúsculas el NER general de spaCy no distingue nombres de
términos clínicos, y un gazetteer solo encuentra los nombres que ya conoce (con
nombres nuevos la detección cayó a ~3 %). Este modelo aprende de los datos a
reconocer nombres por su CONTEXTO ("madre … cc", "firmado por … residente",
"dra … de neumologia") y por su forma (sub-palabras), no por memoria.

- Arquitectura: `spacy init config --pipeline ner --optimize efficiency`
  (tok2vec CNN con hash embeddings, sin vectores estáticos): unos MB, rápido en
  una CPU modesta, sin GPU ni LLM.
- Datos: textos + ground truth de nombres de los datasets dados. Las historias
  se parten en fragmentos; se usan todos los que tienen nombres y una parte de
  los que no (para que aprenda también lo que NO es nombre).
- Evaluación honesta: entrenar con datasets cuyos nombres NO aparezcan en el de
  prueba (ver variar_nombres_dataset.py: variante A para entrenar, B para medir).

    python -m tests.evaluacion.entrenar_modelo_nombres \\
        --entrenar ~/Documents/dataset_hc_variacion_nombres/datos_hc_variacion_nombres \\
                   ~/Documents/dataset_hc_otras_enfermedades/datos_hc_otras_enfermedades \\
        --salida anonimizador/modelos/nombres
"""

import argparse
import json
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import spacy
from spacy.tokens import DocBin

ETIQUETA = "PER"

# --- Aumento de datos: nombres inventados -----------------------------------
# Un solo juego de nombres repetido en todas las historias se memoriza. Cada
# copia aumentada cambia cada palabra de nombre por una inventada (sílabas con
# fonética del español, más terminaciones de apellidos de varios orígenes), así
# que la única pista estable es el CONTEXTO ("madre ___ ___ cc", "dra ___").
_INICIOS = ["b", "c", "ch", "d", "f", "g", "gu", "j", "k", "l", "ll", "m", "n", "p", "r", "s", "t", "v",
            "y", "z", "br", "cr", "dr", "fr", "gr", "pr", "tr", "bl", "cl", "fl", "pl", "qu", "h", "w", ""]
_VOCALES = ["a", "e", "i", "o", "u", "a", "e", "o", "a", "i", "ia", "ue"]
_CODAS = ["", "", "", "n", "r", "s", "l", "z"]
_FINALES_APELLIDO = ["ez", "es", "era", "ano", "ini", "oy", "ua", "ana", "ena", "ato", "eta", "illa", "ar",
                     "ir", "on", "ega", "aga", "uri", "ain", "elli", "akis", "off", "mann", "son", "ita"]
_FINALES_NOMBRE = ["a", "o", "is", "er", "an", "el", "eth", "ys", "ny", "ley", "son", "ina", "ito", "ian"]


def nombre_inventado(rng: random.Random, apellido: bool) -> str:
    silabas = "".join(rng.choice(_INICIOS) + rng.choice(_VOCALES) + rng.choice(_CODAS)
                      for _ in range(rng.choice([1, 1, 2])))
    fin = rng.choice(_FINALES_APELLIDO if apellido else _FINALES_NOMBRE)
    palabra = re.sub(r"(.)\1\1+", r"\1\1", silabas + fin)
    return palabra if len(palabra) >= 3 else palabra + "ro"


def variante(caso: dict, rng: random.Random) -> dict:
    """Copia del caso con cada palabra de nombre (dentro de los tramos de
    nombres del ground truth) cambiada por una inventada, consistente en el doc."""
    nombres = caso["ground_truth"].get("nombres", [])
    mapa: dict[str, str] = {}

    def cambiar(m: re.Match) -> str:
        palabra = m.group(0)
        clave = palabra.lower()
        if len(clave) < 3:
            return palabra
        if clave not in mapa:
            mapa[clave] = nombre_inventado(rng, apellido=rng.random() < 0.55)
        nueva = mapa[clave]
        return nueva.capitalize() if palabra[:1].isupper() else nueva

    texto = caso["texto"]
    partes, cursor = [], 0
    for a, b in tramos_de_nombres(texto, nombres):
        partes += [texto[cursor:a], re.sub(r"[^\W\d_]+", cambiar, texto[a:b])]
        cursor = b
    texto_nuevo = "".join(partes) + texto[cursor:]
    nombres_nuevos = [re.sub(r"[^\W\d_]+", cambiar, v) for v in nombres]
    return {"texto": texto_nuevo, "ground_truth": {"nombres": nombres_nuevos}}
LARGO_FRAGMENTO = 500       # caracteres aprox. por ejemplo de entrenamiento
PROPORCION_NEGATIVOS = 0.35  # fragmentos sin nombres que se conservan
SEMILLA = 7


def tramos_de_nombres(texto: str, nombres: list[str]) -> list[tuple[int, int]]:
    """Todas las apariciones de los nombres del ground truth (las más largas
    primero, sin solaparse), sin distinguir mayúsculas."""
    ocupados: list[tuple[int, int]] = []
    for v in sorted({n for n in nombres if len(n.strip()) >= 3}, key=len, reverse=True):
        patron = r"(?<![\w])" + r"\s+".join(map(re.escape, v.split())) + r"(?![\w])"
        for m in re.finditer(patron, texto, flags=re.IGNORECASE):
            if not any(a < m.end() and m.start() < b for a, b in ocupados):
                ocupados.append((m.start(), m.end()))
    return sorted(ocupados)


def fragmentos(texto: str, tramos: list[tuple[int, int]]) -> list[tuple[str, list[tuple[int, int]]]]:
    """Parte el texto en trozos de ~LARGO_FRAGMENTO caracteres, cortando en un
    espacio que no caiga dentro de un nombre."""
    salida, inicio = [], 0
    while inicio < len(texto):
        fin = min(len(texto), inicio + LARGO_FRAGMENTO)
        if fin < len(texto):
            corte = texto.rfind(" ", inicio + LARGO_FRAGMENTO // 2, fin)
            fin = corte if corte > 0 else fin
            while any(a < fin < b for a, b in tramos):
                fin += 1
        ents = [(a - inicio, b - inicio) for a, b in tramos if a >= inicio and b <= fin]
        salida.append((texto[inicio:fin], ents))
        inicio = fin
    return salida


def construir_docbin(nlp, casos: list[dict], rng: random.Random) -> tuple[DocBin, dict]:
    db, stats = DocBin(), {"fragmentos": 0, "nombres": 0, "desalineados": 0}
    for caso in casos:
        texto = caso["texto"]
        tramos = tramos_de_nombres(texto, caso["ground_truth"].get("nombres", []))
        for trozo, ents in fragmentos(texto, tramos):
            if not ents and rng.random() > PROPORCION_NEGATIVOS:
                continue
            doc = nlp.make_doc(trozo)
            spans = []
            for a, b in ents:
                span = doc.char_span(a, b, label=ETIQUETA, alignment_mode="expand")
                if span is None:
                    stats["desalineados"] += 1
                elif not any(s.start < span.end and span.start < s.end for s in spans):
                    spans.append(span)
            doc.ents = spans
            db.add(doc)
            stats["fragmentos"] += 1
            stats["nombres"] += len(spans)
    return db, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--entrenar", nargs="+", type=Path, required=True, help="Carpetas de casos (.json)")
    ap.add_argument("--salida", type=Path, required=True)
    ap.add_argument("--pasos", type=int, default=6000)
    ap.add_argument("--variantes", type=int, default=0,
                    help="Copias aumentadas con nombres inventados por cada historia de entrenamiento")
    ap.add_argument("--optimizar", choices=["efficiency", "accuracy"], default="efficiency")
    ap.add_argument("--ancho", type=int, default=0, help="Ancho del tok2vec (0 = el de la plantilla)")
    ap.add_argument("--vectores", action="store_true", help="Vectores estáticos de es_core_news_md")
    ap.add_argument("--validar", type=Path,
                    help="Carpeta de casos para elegir el mejor punto del entrenamiento (nombres realistas "
                         "que no estén ni en el entrenamiento ni en la prueba). Sin ella, se separa un 10 %% "
                         "del entrenamiento con nombres inventados.")
    args = ap.parse_args()

    rng = random.Random(SEMILLA)
    casos = [json.loads(p.read_text(encoding="utf-8")) for d in args.entrenar for p in sorted(d.glob("*.json"))]
    rng.shuffle(casos)
    n_dev = 0 if args.validar else max(1, len(casos) // 10)
    nlp = spacy.blank("es")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        entrenamiento = casos[n_dev:] + [variante(c, rng) for c in casos[n_dev:] for _ in range(args.variantes)]
        if args.validar:
            # Nombres realistas nunca vistos: el "mejor" modelo es el que mejor
            # generaliza a nombres reales, no a los inventados del aumento.
            dev = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(args.validar.glob("*.json"))]
        else:
            dev = [variante(c, rng) for c in casos[:n_dev]]
        for nombre, subset in (("train", entrenamiento), ("dev", dev)):
            db, stats = construir_docbin(nlp, subset, rng)
            db.to_disk(tmp / f"{nombre}.spacy")
            print(f"{nombre}: {len(subset)} historias → {stats}")

        subprocess.run([sys.executable, "-m", "spacy", "init", "config", str(tmp / "config.cfg"),
                        "--lang", "es", "--pipeline", "ner", "--optimize", args.optimizar, "--force"],
                       check=True)
        extra = []
        if args.ancho:
            extra += ["--components.tok2vec.model.encode.width", str(args.ancho)]
        if args.vectores:
            extra += ["--paths.vectors", "es_core_news_md"]
        subprocess.run([sys.executable, "-m", "spacy", "train", str(tmp / "config.cfg"),
                        "--output", str(tmp / "salida"),
                        "--paths.train", str(tmp / "train.spacy"), "--paths.dev", str(tmp / "dev.spacy"),
                        "--training.max_steps", str(args.pasos), "--training.patience", "3000",
                        "--training.eval_frequency", "400", "--system.seed", str(SEMILLA), *extra],
                       check=True)
        if args.salida.exists():
            shutil.rmtree(args.salida)
        shutil.copytree(tmp / "salida" / "model-best", args.salida)
    print("modelo en", args.salida)


if __name__ == "__main__":
    main()
