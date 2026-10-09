import csv
import re
from pathlib import Path

import pymupdf
from openpyxl import load_workbook

from anonimizador.lote import Lote

TEXTO = (
    "HISTORIA CLÍNICA\nPaciente: Laura Martínez Ospina\nCC 1067618172\n"
    "Teléfono: 3001234567\nDiagnóstico: cefalea tensional."
)


def crear_pdf(ruta: Path, texto: str = TEXTO) -> Path:
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), texto)
    doc.save(ruta)
    return ruta


def test_lote_completo(tmp_path, anonimizador):
    origen = tmp_path / "origen"
    origen.mkdir()
    pdfs = [crear_pdf(origen / f"Historia {n} - Martínez.pdf") for n in (1, 2)]
    (origen / "vacio.pdf").write_bytes(b"no es un pdf")
    pdfs.append(origen / "vacio.pdf")

    eventos = []
    lote = Lote(pdfs, tmp_path / "salida")
    lote.procesar(anonimizador, al_avanzar=lambda d: eventos.append((d.codigo, d.estado)))

    ok = [d for d in lote.documentos if d.estado == "completado"]
    error = [d for d in lote.documentos if d.estado == "error"]
    assert len(ok) == 2 and len(error) == 1 and error[0].error

    # Códigos únicos con formato fijo, y son el nombre del PDF anonimizado.
    codigos = [d.codigo for d in lote.documentos]
    assert len(set(codigos)) == 3
    assert all(re.fullmatch(r"HC-[2-9A-HJKMNP-Z]{8}", c) for c in codigos)
    for d in ok:
        pdf = lote.carpeta_pdfs / f"{d.codigo}.pdf"
        texto = pymupdf.open(pdf)[0].get_text()
        assert "Laura" not in texto and "1067618172" not in texto and "3001234567" not in texto
        assert "cefalea" in texto
        # El nombre original no viaja en los metadatos.
        assert "Martínez" not in str(pymupdf.open(pdf).metadata)

    # Tabla de relación: original ↔ código, en Excel y CSV.
    hoja = load_workbook(lote.carpeta / "relacion_codigos.xlsx").active
    filas = list(hoja.iter_rows(min_row=2, values_only=True))
    assert {(f[0], f[1]) for f in filas} == {(d.codigo, d.archivo_original) for d in lote.documentos}
    with open(lote.carpeta / "relacion_codigos.csv", encoding="utf-8-sig") as f:
        assert len(list(csv.reader(f, delimiter=";"))) == 4

    assert ("procesando" in {e for _, e in eventos}) and len(eventos) == 6


def test_cancelar_detiene_y_registra(tmp_path, anonimizador):
    pdfs = [crear_pdf(tmp_path / f"{n}.pdf") for n in range(3)]
    lote = Lote(pdfs, tmp_path / "salida")
    hechos = []
    lote.procesar(anonimizador, al_avanzar=lambda d: hechos.append(d.estado),
                  cancelado=lambda: hechos.count("completado") >= 1)
    assert [d.estado for d in lote.documentos] == ["completado", "pendiente", "pendiente"]
    filas = list(load_workbook(lote.carpeta / "relacion_codigos.xlsx").active.values)[1:]
    assert [f[3] for f in filas] == ["Anonimizado", "Cancelado", "Cancelado"]


def test_carpetas_de_lote_no_se_pisan(tmp_path):
    a = Lote([], tmp_path)
    a.carpeta.mkdir()
    b = Lote([], tmp_path)
    assert a.carpeta != b.carpeta


def test_nombre_partido_entre_renglones_del_pdf(tmp_path, anonimizador):
    """El PDF ajusta el párrafo al ancho de página y parte el nombre en dos
    renglones: la extracción debe reunirlos para que se redacte completo."""
    doc = pymupdf.open()
    pagina = doc.new_page()
    caja = pymupdf.Rect(72, 72, 300, 300)
    pagina.insert_textbox(
        caja,
        "EVOLUCION DIA 2 DE VIDA VALORADO POR DR ANDERSON DE LA ROSA GRUESO PEDIATRA DE TURNO. "
        "PACIENTE ESTABLE.",
        fontsize=11,
    )
    ruta = tmp_path / "partido.pdf"
    doc.save(ruta)
    assert "\n" in pymupdf.open(ruta)[0].get_text().strip()  # el PDF sí parte renglones

    destino = tmp_path / "salida" / "HC-TEST.pdf"
    anonimizador.anonimizar_pdf(ruta, destino)
    texto = pymupdf.open(destino)[0].get_text()
    for palabra in ("ANDERSON", "ROSA", "GRUESO"):
        assert palabra not in texto
    assert "PEDIATRA DE TURNO" in texto
