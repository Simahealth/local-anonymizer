"""Variante del dataset "otras enfermedades" con nombres que el detector no conoce.

El gazetteer del detector se amplió mirando ese dataset, así que sus nombres
ficticios coinciden en parte con lo que el detector ya sabe: la métrica sale
inflada. Esta variante reemplaza cada palabra de nombre (nombre de pila o
apellido) del ground truth por un sustituto propuesto por agentes, validado
para que NO esté en el gazetteer. El resultado es un conjunto de prueba
"fuera de muestra" para los nombres.

Los reemplazos se aplican SOLO dentro de los tramos que el ground truth marca
como nombres (el texto clínico no se toca) y conservan mayúsculas/minúsculas.

    python -m tests.evaluacion.variar_nombres_dataset \\
        ~/Documents/dataset_hc_otras_enfermedades ~/Documents/dataset_hc_variacion_nombres
"""

import argparse
import json
import re
import shutil
from collections import Counter
from pathlib import Path

from anonimizador.extractor import ExtractorPDF
from anonimizador.reconocedores.nombre_gazetteer import _normalizar, cargar_nombres
from tests.evaluacion.generar_dataset_otras_enfermedades import (
    Documento,
    aplicar_ediciones,
    escribir_pdf,
    normalizar,
)


def cargar_mapa(dir_agentes: Path) -> tuple[dict[str, str], Counter]:
    """Une los mapas de los agentes y descarta sustitutos inválidos."""
    gazetteer = cargar_nombres()
    mapa, informe = {}, Counter()
    for ruta in sorted(dir_agentes.glob("mapa_*.json")):
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        for original, sustituto in datos.get("mapa", {}).items():
            s = _normalizar(str(sustituto).strip())
            if not re.fullmatch(r"[a-zñ]{3,}", s):
                informe["sustitutos_invalidos"] += 1
            elif s in gazetteer:
                informe["sustitutos_en_gazetteer"] += 1
            else:
                mapa[_normalizar(original)] = s
        informe["no_es_nombre"] += len(datos.get("no_es_nombre", []))
    informe["palabras_mapeadas"] = len(mapa)
    informe["sustitutos_repetidos"] = len(mapa) - len(set(mapa.values()))
    return mapa, informe


def _con_caso(modelo: str, nueva: str) -> str:
    if modelo.isupper() and len(modelo) > 1:
        return nueva.upper()
    if modelo[:1].isupper():
        return nueva.capitalize()
    return nueva


def traducir(valor: str, mapa: dict[str, str]) -> str:
    """Cambia cada palabra de nombre conocida en `valor`, conservando el caso."""
    return re.sub(
        r"[^\W\d_]+",
        lambda m: _con_caso(m.group(0), mapa[_normalizar(m.group(0))]) if _normalizar(m.group(0)) in mapa else m.group(0),
        valor,
    )


def variar(d: Documento, mapa: dict[str, str]) -> None:
    nombres = sorted(d.gt["nombres"], key=len, reverse=True)
    patrones = [re.compile(r"(?<![\w])" + r"\s+".join(map(re.escape, v.split())) + r"(?![\w])", re.IGNORECASE)
                for v in nombres if v.strip()]
    registros = []
    for fecha, cuerpo in d.registros:
        # Tramos de nombres (los más largos primero, sin solaparse).
        ocupados: list[tuple[int, int]] = []
        for p in patrones:
            for m in p.finditer(cuerpo):
                if not any(a < m.end() and m.start() < b for a, b in ocupados):
                    ocupados.append((m.start(), m.end()))
        partes, cursor = [], 0
        for a, b in sorted(ocupados):
            partes += [cuerpo[cursor:a], traducir(cuerpo[a:b], mapa)]
            cursor = b
        registros.append((fecha, "".join(partes) + cuerpo[cursor:]))
    d.registros = registros
    d.gt["nombres"] = {traducir(v, mapa) for v in d.gt["nombres"]}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("origen", type=Path, help="Dataset original (con base/ y ediciones/)")
    ap.add_argument("destino", type=Path, help="Carpeta de la variante (con agentes/mapa_*.json)")
    args = ap.parse_args()

    mapa, informe = cargar_mapa(args.destino / "agentes")
    pdf_dir, casos_dir = args.destino / "pdfs", args.destino / "datos_hc_variacion_nombres"
    for carpeta in (pdf_dir, casos_dir):
        if carpeta.exists():
            shutil.rmtree(carpeta)
        carpeta.mkdir(parents=True)

    extractor = ExtractorPDF()
    totales, faltantes = Counter(), 0
    for ruta_base in sorted((args.origen / "base").glob("*.json")):
        nombre = ruta_base.stem
        b = json.loads(ruta_base.read_text(encoding="utf-8"))
        d = Documento(b["idcliente"], b["n_registros"], [tuple(r) for r in b["registros"]])
        for c, v in b["ground_truth"].items():
            d.gt[c] = set(v)
        ruta_ed = args.origen / "ediciones" / f"{nombre}.json"
        if ruta_ed.exists():
            aplicar_ediciones(d, json.loads(ruta_ed.read_text(encoding="utf-8")), Counter())
        cabecera = b.get("cabecera")
        variar(d, mapa)
        if cabecera:
            cabecera = traducir(cabecera, mapa)
        ruta = pdf_dir / f"{nombre}.pdf"
        escribir_pdf(d, cabecera, ruta)
        texto = extractor.extraer(ruta)
        plano = normalizar(texto)
        gt = {}
        for c, valores in d.gt.items():
            presentes = sorted(v for v in valores if normalizar(v) in plano)
            faltantes += len(valores) - len(presentes)
            if presentes:
                gt[c] = presentes
                totales[c] += len(presentes)
        (casos_dir / f"{nombre}.json").write_text(json.dumps({
            "nombre": nombre,
            "descripcion": "Variante de hc_otras_enfermedades con nombres fuera del gazetteer del detector.",
            "texto": texto,
            "ground_truth": gt,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    # ¿Cuántas palabras de nombre del ground truth conoce el detector?
    gazetteer = cargar_nombres()
    palabras = [_normalizar(t) for f in casos_dir.glob("*.json")
                for v in json.loads(f.read_text())["ground_truth"].get("nombres", [])
                for t in re.findall(r"[^\W\d_]{3,}", v)]
    conocidas = sum(p in gazetteer for p in palabras)
    resumen = {**informe, "valores_por_categoria": dict(totales), "valores_descartados": faltantes,
               "palabras_de_nombre_en_gazetteer": f"{conocidas}/{len(palabras)}"}
    (args.destino / "resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=2))
    print(json.dumps(resumen, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
