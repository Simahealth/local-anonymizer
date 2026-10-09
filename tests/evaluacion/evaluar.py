"""
Evaluación del detector de PII contra un conjunto de casos sintéticos.

Cada caso (tests/evaluacion/datos/*.json) trae un texto clínico y su
ground_truth: la lista de valores de PII que un humano redactaría, por categoría.

Se reportan dos vistas complementarias:

  1. Recall de redacción (métrica principal de privacidad)
     ¿Qué fracción de la PII fue redactada por *alguna* categoría?
     Lo único que importa para cumplimiento es que el dato no se filtre;
     la etiqueta exacta es secundaria. Los valores no redactados ("fugas")
     se listan explícitamente porque son el riesgo real.

  2. Precisión/Recall/F1 por categoría (calidad del etiquetado)
     Mide qué tan bien cada categoría acierta su propia etiqueta. Expone
     huecos de cobertura (categorías sin reconocedor determinista) y
     sobre-anonimización (falsos positivos que degradan el documento).

La lógica de métricas vive en metricas.py (módulo puro, reutilizable por la
comparación externa entre sistemas).

Uso:
    python -m tests.evaluacion.evaluar                # todos los casos
    python -m tests.evaluacion.evaluar --caso caso_cedulas
    python -m tests.evaluacion.evaluar --solo-presidio  # ignora fallback WatsonX
    python -m tests.evaluacion.evaluar --registrar --etiqueta "mi-cambio"
"""

import argparse
import json
from pathlib import Path

from anonimizador.detector import DetectorPII
from tests.evaluacion.metricas import (
    CATEGORIAS,
    cargar_casos,
    coincidencia_flexible,
    emparejar,
    prf,
)

DIR_EVAL = Path(__file__).parent


def ruta_resultados(datos=None):
    """Archivo de historial. Por dataset, para no mezclar tracks.

    Set por defecto (colombiano): resultados.jsonl.
    Set alterno (--datos): resultados_<nombre>.jsonl (p. ej. resultados_datos_meddocan.jsonl),
    así el Δ de `historial` compara corridas del *mismo* dataset, no entre datasets.
    """
    if datos:
        return DIR_EVAL / f"resultados_{Path(datos).name}.jsonl"
    return DIR_EVAL / "resultados.jsonl"

# Categorías puntuadas sin reconocedor determinista (solo las cubriría WatsonX).
# Se marcan en el reporte para no confundir un hueco conocido con una regresión.
# Vacío hoy: todas las categorías en alcance tienen reconocedor determinista.
SIN_RECONOCEDOR: set[str] = set()


# --------------------------------------------------------------------------- #
# Evaluación
# --------------------------------------------------------------------------- #

def evaluar_caso(caso, detector, solo_presidio):
    texto = caso["texto"]
    verdad = {cat: set(vals) for cat, vals in caso["ground_truth"].items()}

    if solo_presidio:
        detectado = detector._detectar_con_presidio(texto)
    else:
        detectado = detector.detectar(texto)

    # Por categoría. Emparejamiento flexible a nivel de tokens para no penalizar
    # diferencias de span (p. ej. el título 'Dr.' adherido al nombre) como si
    # fueran detecciones equivocadas. Los FP que sobreviven son sobre-redacción real.
    por_categoria = {}
    for cat in CATEGORIAS:
        tp, fp, fn = emparejar(
            detectado.get(cat, set()), verdad.get(cat, set()), coincidencia_flexible
        )
        por_categoria[cat] = {"tp": tp, "fp": fp, "fn": fn}

    # Redacción global (privacidad): todo lo detectado contra la PII esperada
    # *en alcance*. El esperado se filtra a CATEGORIAS (no penalizamos por no
    # redactar fechas/ubicaciones); lo detectado NO se filtra, porque si un nombre
    # se redactó bajo la etiqueta 'ubicaciones' igual desapareció del documento.
    todos_detectados = {v for vals in detectado.values() for v in vals}
    todos_esperados = {v for cat in CATEGORIAS for v in verdad.get(cat, set())}
    tp_r, _, fugas = emparejar(
        todos_detectados, todos_esperados, coincidencia_flexible
    )

    return {
        "nombre": caso["nombre"],
        "por_categoria": por_categoria,
        "total_pii": len(todos_esperados),
        "redactados": tp_r,
        "fugas": sorted(fugas),
    }


# --------------------------------------------------------------------------- #
# Reporte
# --------------------------------------------------------------------------- #

def _pct(x):
    return " —  " if x is None else f"{x * 100:5.1f}"


def imprimir_reporte(resultados):
    print("\n" + "=" * 70)
    print("RECALL DE REDACCIÓN  (privacidad: ¿se redactó la PII?)")
    print("=" * 70)
    total_pii = total_red = 0
    for res in resultados:
        total_pii += res["total_pii"]
        total_red += res["redactados"]
        if res["total_pii"] == 0:
            tasa = "  N/A (sin PII)"
        else:
            tasa = f"{res['redactados']}/{res['total_pii']}  ({res['redactados'] / res['total_pii'] * 100:.0f}%)"
        print(f"  {res['nombre']:<28} {tasa}")
        for fuga in res["fugas"]:
            print(f"      ⚠ fuga: {fuga!r}")
    print("-" * 70)
    if total_pii:
        print(f"  {'GLOBAL':<28} {total_red}/{total_pii}  ({total_red / total_pii * 100:.1f}%)")

    # Agregado por categoría.
    agg = {cat: {"tp": 0, "fp": 0, "fn": 0} for cat in CATEGORIAS}
    fps_por_cat = {cat: [] for cat in CATEGORIAS}
    for res in resultados:
        for cat, m in res["por_categoria"].items():
            agg[cat]["tp"] += m["tp"]
            agg[cat]["fp"] += len(m["fp"])
            agg[cat]["fn"] += len(m["fn"])
            fps_por_cat[cat].extend(m["fp"])

    print("\n" + "=" * 70)
    print("POR CATEGORÍA  (calidad del etiquetado, micro-promedio)")
    print("=" * 70)
    print(f"  {'categoría':<20} {'TP':>4} {'FP':>4} {'FN':>4}   {'Prec':>5} {'Rec':>5} {'F1':>5} {'F2':>5}")
    print("  " + "-" * 70)
    for cat in CATEGORIAS:
        m = agg[cat]
        if m["tp"] + m["fp"] + m["fn"] == 0:
            continue
        p, r, f1, f2 = prf(m["tp"], m["fp"], m["fn"])
        nota = "  (sin reconocedor)" if cat in SIN_RECONOCEDOR else ""
        print(
            f"  {cat:<20} {m['tp']:>4} {m['fp']:>4} {m['fn']:>4}   "
            f"{_pct(p)} {_pct(r)} {_pct(f1)} {_pct(f2)}{nota}"
        )

    # Falsos positivos (sobre-anonimización): lo que se redactó sin ser PII.
    sobrantes = [(cat, v) for cat in CATEGORIAS for v in fps_por_cat[cat]]
    if sobrantes:
        print("\n  Falsos positivos (texto redactado que no era PII esperada):")
        for cat, v in sobrantes:
            print(f"      {cat}: {v!r}")
    print()


def resumen_metricas(resultados):
    """Condensa los resultados en un dict apto para registrar en JSONL."""
    total_pii = sum(r["total_pii"] for r in resultados)
    redactados = sum(r["redactados"] for r in resultados)

    agg = {cat: {"tp": 0, "fp": 0, "fn": 0} for cat in CATEGORIAS}
    for res in resultados:
        for cat, m in res["por_categoria"].items():
            agg[cat]["tp"] += m["tp"]
            agg[cat]["fp"] += len(m["fp"])
            agg[cat]["fn"] += len(m["fn"])

    por_categoria = {}
    for cat, m in agg.items():
        if m["tp"] + m["fp"] + m["fn"] == 0:
            continue
        p, r, f1, f2 = prf(m["tp"], m["fp"], m["fn"])
        por_categoria[cat] = {
            "tp": m["tp"], "fp": m["fp"], "fn": m["fn"],
            "precision": round(p, 3) if p is not None else None,
            "recall": round(r, 3) if r is not None else None,
            "f1": round(f1, 3) if f1 is not None else None,
            "f2": round(f2, 3) if f2 is not None else None,
        }

    return {
        "n_pii": total_pii,
        "redactados": redactados,
        "recall_redaccion": round(redactados / total_pii, 3) if total_pii else None,
        "fp_total": sum(m["fp"] for m in agg.values()),
        "por_categoria": por_categoria,
    }


def registrar_resultado(resultados, sistema, etiqueta, nota, n_casos, archivo, dataset):
    """Anexa una fila al historial de resultados del dataset correspondiente."""
    import datetime

    fila = {
        "fecha": datetime.date.today().isoformat(),
        "sistema": sistema,
        "dataset": dataset,
        "etiqueta": etiqueta,
        "nota": nota,
        "n_casos": n_casos,
        **resumen_metricas(resultados),
    }
    with open(archivo, "a", encoding="utf-8") as f:
        f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    print(f"\n✓ Registrado en {archivo.name}  (sistema={sistema}, dataset={dataset}, etiqueta={etiqueta!r})")


def main():
    parser = argparse.ArgumentParser(description="Evalúa el detector de PII.")
    parser.add_argument("--caso", help="Evaluar un solo caso por nombre.")
    parser.add_argument("--datos", help="Carpeta de fixtures alterna (por defecto datos/).")
    parser.add_argument(
        "--solo-presidio",
        action="store_true",
        help="Usar solo el detector determinista (omite el fallback de WatsonX).",
    )
    parser.add_argument(
        "--registrar",
        action="store_true",
        help="Anexar el resultado al historial (resultados.jsonl).",
    )
    parser.add_argument("--sistema", default="presidio", help="Nombre del sistema evaluado.")
    parser.add_argument("--etiqueta", default="", help="Etiqueta de la iteración (p. ej. 'baseline').")
    parser.add_argument("--nota", default="", help="Nota libre sobre el cambio evaluado.")
    args = parser.parse_args()

    casos = cargar_casos(args.caso, args.datos)
    if not casos:
        print("No se encontraron casos.")
        return

    print(f"Cargando detector… ({len(casos)} caso(s))")
    detector = DetectorPII()

    resultados = [evaluar_caso(c, detector, args.solo_presidio) for c in casos]
    imprimir_reporte(resultados)

    if args.registrar:
        dataset = Path(args.datos).name if args.datos else "datos"
        registrar_resultado(
            resultados, args.sistema, args.etiqueta, args.nota, len(casos),
            ruta_resultados(args.datos), dataset,
        )


if __name__ == "__main__":
    main()
