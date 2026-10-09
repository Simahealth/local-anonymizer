"""
Muestra el historial de evaluaciones como una tabla legible.

Cada fila es una corrida registrada con `evaluar.py --registrar`. La columna Δ
muestra el cambio de recall respecto a la corrida anterior del mismo sistema
*dentro del mismo dataset*.

El historial se guarda por dataset, para no mezclar tracks:
  - set por defecto (colombiano):  resultados.jsonl
  - set alterno (--datos):         resultados_<nombre>.jsonl

    python -m tests.evaluacion.historial                              # set colombiano
    python -m tests.evaluacion.historial --datos datos_meddocan       # set MEDDOCAN
"""

import argparse
import json
from pathlib import Path

DIR_EVAL = Path(__file__).parent


def ruta_resultados(datos=None):
    if datos:
        return DIR_EVAL / f"resultados_{Path(datos).name}.jsonl"
    return DIR_EVAL / "resultados.jsonl"


def main():
    ap = argparse.ArgumentParser(description="Historial de evaluaciones como tabla.")
    ap.add_argument("--datos", help="Dataset cuyo historial mostrar (p. ej. datos_meddocan).")
    args = ap.parse_args()

    archivo = ruta_resultados(args.datos)
    if not archivo.exists():
        print(f"No hay historial todavía en {archivo.name}. Registra una corrida con:")
        print("  evaluar.py --solo-presidio --registrar --etiqueta ... [--datos <dir>]")
        return

    filas = [json.loads(l) for l in archivo.read_text(encoding="utf-8").splitlines() if l.strip()]

    print(f"Historial: {archivo.name}\n")
    print(f"{'fecha':<11} {'sistema':<9} {'etiqueta':<14} {'recall':>7} {'redact.':>9} {'Δ':>6}  nota")
    print("-" * 92)

    previo = {}
    for f in filas:
        sistema = f.get("sistema", "")
        recall = f.get("recall_redaccion")
        recall_txt = "—" if recall is None else f"{recall * 100:.1f}%"
        redact = f"{f.get('redactados', '?')}/{f.get('n_pii', '?')}"

        delta = ""
        if recall is not None and previo.get(sistema) is not None:
            delta = f"{(recall - previo[sistema]) * 100:+.1f}"
        if recall is not None:
            previo[sistema] = recall

        nota = (f.get("nota") or "")[:46]
        print(f"{f.get('fecha', ''):<11} {sistema:<9} {f.get('etiqueta', ''):<14} "
              f"{recall_txt:>7} {redact:>9} {delta:>6}  {nota}")


if __name__ == "__main__":
    main()
