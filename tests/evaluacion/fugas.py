"""Fugas de punta a punta: ¿queda PII visible en el texto FINAL anonimizado?

`evaluar.py` mide la detección (qué valores encontró el detector). Esto mide lo
que de verdad importa para la privacidad: se corre el pipeline completo
(detectar → reemplazar) y se busca cada valor del ground truth en el texto de
salida. Un valor "fuga" si alguno de sus fragmentos identificadores sobrevive:

  * nombres:            cualquier palabra de ≥3 letras (sin conectores "de", "la"…)
  * direcciones:        el valor completo o un número de 2+ dígitos (la placa)
  * resto (documentos,
    teléfonos, emails,
    números de registro): el valor completo, o su secuencia de dígitos

Con `--pdfs`, el texto de cada caso se extrae del PDF homónimo (mismo nombre
que el .json) en vez de usar el `texto` del fixture: así se mide también lo que
introduce la extracción (renglones partidos, campos pegados), que es lo que
de verdad recibe el detector en la app.

Uso:
    python -m tests.evaluacion.fugas --datos tests/evaluacion/datos_sintetico_ame
    python -m tests.evaluacion.fugas --datos tests/evaluacion/datos_sintetico_ame \
        --pdfs tests/evaluacion/pdfs_sintetico_ame
"""

import argparse
import re
from pathlib import Path

from anonimizador.detector import DetectorPII
from anonimizador.extractor import ExtractorPDF
from anonimizador.reemplazador import Reemplazador
from tests.evaluacion.metricas import CATEGORIAS, cargar_casos

# Conectores y títulos: no identifican a nadie por sí solos.
CONECTORES = {"de", "del", "la", "las", "los", "y", "san", "santa", "dr", "dra", "doctor", "doctora"}


def fragmentos(categoria: str, valor: str) -> list[str]:
    """Fragmentos que, si siguen en el texto, delatan el valor."""
    if categoria == "nombres":
        return [p for p in re.findall(r"[^\W\d_]{3,}", valor) if p.lower() not in CONECTORES]
    if categoria == "direcciones":
        # Números de 2+ dígitos: uno suelto ("piso 4") aparece por azar en el texto.
        return [valor] + re.findall(r"\d{2,}", valor)
    digitos = re.sub(r"\D", "", valor)
    return [valor] + ([digitos] if len(digitos) >= 5 else [])


def sobrevive(fragmento: str, texto: str) -> bool:
    patron = r"(?<![^\W_])" + re.escape(fragmento) + r"(?![^\W_])"
    return re.search(patron, texto, flags=re.IGNORECASE) is not None


def fugas_caso(caso, detector, reemplazador, texto=None) -> list[tuple[str, str, str]]:
    texto = caso["texto"] if texto is None else texto
    salida = reemplazador.reemplazar(texto, detector.detectar(texto))
    fugas = []
    for cat in CATEGORIAS:
        for valor in caso["ground_truth"].get(cat, []):
            vivos = [f for f in fragmentos(cat, valor) if sobrevive(f, salida)]
            if vivos:
                fugas.append((cat, valor, ", ".join(vivos)))
    return fugas


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--datos", help="Carpeta de casos (por defecto tests/evaluacion/datos)")
    parser.add_argument("--pdfs", help="Carpeta con los PDF de los casos (<nombre>.pdf)")
    parser.add_argument("--quieto", action="store_true", help="Solo el resumen, sin listar fugas")
    args = parser.parse_args()

    casos = cargar_casos(dir_datos=Path(args.datos) if args.datos else None)
    detector, reemplazador = DetectorPII(), Reemplazador()

    total = sum(len(c["ground_truth"].get(cat, [])) for c in casos for cat in CATEGORIAS)
    if args.pdfs:
        extractor = ExtractorPDF()
        casos = [c for c in casos if (Path(args.pdfs) / f"{c['nombre']}.pdf").exists()]
        textos = {c["nombre"]: extractor.extraer(Path(args.pdfs) / f"{c['nombre']}.pdf") for c in casos}
        total = sum(len(c["ground_truth"].get(cat, [])) for c in casos for cat in CATEGORIAS)
    else:
        textos = {}
    todas = [
        (c["nombre"], *f)
        for c in casos
        for f in fugas_caso(c, detector, reemplazador, textos.get(c["nombre"]))
    ]

    if not args.quieto:
        for nombre, cat, valor, vivos in todas:
            print(f"  {nombre:28} {cat:16} {valor!r:45} → sigue: {vivos}")
    pct = 100 * (1 - len(todas) / total) if total else 100.0
    print(f"\n{len(casos)} casos · {total} valores PII · {len(todas)} con fuga · "
          f"redacción efectiva {pct:.1f}%")


if __name__ == "__main__":
    main()
