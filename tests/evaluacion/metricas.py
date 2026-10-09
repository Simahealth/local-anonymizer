"""
Métricas y emparejamiento para evaluar anonimizadores.

Módulo **puro** (solo stdlib): no depende de Presidio ni del detector, para que
lo puedan importar tanto la evaluación de este repo (`evaluar.py`) como la
comparación externa entre sistemas. La taxonomía puntuada (CATEGORIAS) es solo
de identificadores directos y la comparten ambos anonimizadores.

Ofrece dos niveles de medición:

  - Emparejamiento de valores (`emparejar`, `coincidencia_flexible`) y P/R/F1
    (`prf`), usados por la evaluación por categoría del detector.

  - Redacción a nivel de texto (`resumen_redaccion`): dada la *salida* de un
    sistema, ¿qué fracción de la PII esperada desapareció del documento? Es
    agnóstica a la taxonomía, por lo que permite comparar sistemas distintos.
"""

import json
import re
from pathlib import Path

DIR_DATOS = Path(__file__).parent / "datos"

# Categorías que SE PUNTÚAN: solo identificadores directos. Esta es la definición
# de "PII que importa" del producto. Las fechas, edades, ubicaciones y seguros NO
# se consideran PII: el detector aún las redacta (sobre-redacción, conservadora a
# nivel de privacidad), pero la evaluación las ignora —no cuentan ni como acierto
# ni como falso positivo—. Para volver a puntuarlas, basta con re-agregarlas aquí.
CATEGORIAS = (
    "nombres", "documentos", "telefonos", "direcciones", "emails", "numeros_registro",
)


def cargar_casos(nombre=None, dir_datos=None):
    """Carga los fixtures de evaluación.

    dir_datos: carpeta de los .json (por defecto datos/). Permite apuntar a otro
               conjunto, p. ej. un set neutral tipo MEDDOCAN, sin tocar código.
    nombre:    si se da, filtra a un solo caso por su 'nombre'.
    """
    base = Path(dir_datos) if dir_datos else DIR_DATOS
    rutas = sorted(base.glob("*.json"))
    casos = [json.loads(r.read_text(encoding="utf-8")) for r in rutas]
    if nombre:
        casos = [c for c in casos if c["nombre"] == nombre]
    return casos


# --------------------------------------------------------------------------- #
# Emparejamiento de valores
# --------------------------------------------------------------------------- #

def normalizar(valor: str) -> str:
    return re.sub(r"\s+", " ", valor.strip().lower())


def coincidencia_flexible(a: str, b: str) -> bool:
    """Exacta, o uno contiene al otro a nivel de tokens completos.

    Permite que 'García' cuente frente a 'Juan García', pero evita que
    'Ana' coincida con 'Mariana'.
    """
    na, nb = normalizar(a), normalizar(b)
    if na == nb:
        return True
    corto, largo = (na, nb) if len(na) <= len(nb) else (nb, na)
    return f" {corto} " in f" {largo} "


def emparejar(detectados, esperados, criterio):
    """Empareja 1-a-1 y retorna (tp, falsos_positivos, falsos_negativos)."""
    detect = list(detectados)
    esper = list(esperados)
    e_usado = [False] * len(esper)
    d_emparejado = [False] * len(detect)

    for i, d in enumerate(detect):
        for j, e in enumerate(esper):
            if not e_usado[j] and criterio(d, e):
                e_usado[j] = d_emparejado[i] = True
                break

    fn = [esper[j] for j in range(len(esper)) if not e_usado[j]]
    fp = [detect[i] for i in range(len(detect)) if not d_emparejado[i]]
    tp = len(esper) - len(fn)
    return tp, fp, fn


def f_beta(p, r, beta=1.0):
    """F-beta a partir de precisión y recall. None si falta alguno.

    beta > 1 pondera más el recall. Para anonimización conviene F2 (beta=2):
    una fuga (falso negativo) es peor que una sobre-redacción (falso positivo).
    """
    if not p or not r:
        return None
    b2 = beta * beta
    return (1 + b2) * p * r / (b2 * p + r)


def prf(tp, fp, fn):
    """Precisión, recall, F1 y F2. Retorna None donde no hay denominador."""
    p = tp / (tp + fp) if (tp + fp) else None
    r = tp / (tp + fn) if (tp + fn) else None
    f1 = f_beta(p, r, 1.0)
    f2 = f_beta(p, r, 2.0)
    # Si hubo conteos pero P o R es cero, F es 0.0 (no indefinido).
    if f1 is None and (tp + fp + fn) > 0:
        f1 = f2 = 0.0
    return p, r, f1, f2


# --------------------------------------------------------------------------- #
# Redacción a nivel de texto (para comparar sistemas por su salida)
# --------------------------------------------------------------------------- #

def sigue_presente(valor: str, texto_anonimizado: str) -> bool:
    """¿El valor de PII sigue apareciendo (literalmente) en el texto anonimizado?

    Comparación normalizada (minúsculas, espacios colapsados). Es una medida
    conservadora del valor completo; una fuga parcial de un solo token de un
    nombre largo no se detecta aquí (limitación conocida).
    """
    return normalizar(valor) in normalizar(texto_anonimizado)


def evaluar_redaccion_caso(texto_anonimizado, ground_truth):
    """Para un documento, cuenta qué PII esperada quedó redactada en la salida."""
    por_categoria = {}
    fugas = []
    n_pii = redactados = 0
    # Solo categorías puntuadas: si el fixture trae etiquetas fuera de alcance
    # (p. ej. ubicaciones en el set sintético), se ignoran.
    for cat in CATEGORIAS:
        valores = ground_truth.get(cat, [])
        cat_red = 0
        cat_fugas = []
        for v in valores:
            n_pii += 1
            if sigue_presente(v, texto_anonimizado):
                cat_fugas.append(v)
                fugas.append((cat, v))
            else:
                redactados += 1
                cat_red += 1
        por_categoria[cat] = {
            "esperados": len(valores), "redactados": cat_red, "fugas": cat_fugas,
        }
    return {
        "n_pii": n_pii, "redactados": redactados,
        "fugas": fugas, "por_categoria": por_categoria,
    }


def resumen_redaccion(casos, salida):
    """Agrega la redacción de un sistema sobre todos los casos.

    casos:  lista de fixtures (cada uno con 'nombre' y 'ground_truth').
    salida: dict {nombre_caso: texto_anonimizado} producido por el sistema.
    """
    n_pii = redactados = 0
    por_categoria = {cat: {"esperados": 0, "redactados": 0, "fugas": []} for cat in CATEGORIAS}
    fugas = []
    faltantes = []
    for caso in casos:
        nombre = caso["nombre"]
        if nombre not in salida:
            faltantes.append(nombre)
            continue
        res = evaluar_redaccion_caso(salida[nombre], caso["ground_truth"])
        n_pii += res["n_pii"]
        redactados += res["redactados"]
        for cat, m in res["por_categoria"].items():
            por_categoria[cat]["esperados"] += m["esperados"]
            por_categoria[cat]["redactados"] += m["redactados"]
            por_categoria[cat]["fugas"].extend(m["fugas"])
        fugas.extend((nombre, cat, v) for cat, v in res["fugas"])
    return {
        "n_pii": n_pii,
        "redactados": redactados,
        "recall_redaccion": round(redactados / n_pii, 3) if n_pii else None,
        "por_categoria": por_categoria,
        "fugas": fugas,
        "faltantes": faltantes,
    }
