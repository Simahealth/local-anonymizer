"""Servicio HTTP (servicio/app.py) con un PDF sintético: todos los datos son inventados."""

import io
import json

import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

TOKEN = "token-de-prueba"

PAGINAS = [
    [
        "HISTORIA CLINICA",
        "Paciente: Mariana Quintero Salcedo",
        "Cedula: CC 1023456789",
        "Telefono: 3105557788",
        "Correo: mariana.quintero@ejemplo.com",
    ],
    [
        "Evolucion: la paciente Quintero refiere mejoria.",
        "Plan: control en 30 dias.",
    ],
]


def _pdf(paginas: list[list[str]]) -> bytes:
    salida = io.BytesIO()
    c = canvas.Canvas(salida, pagesize=letter)
    for lineas in paginas:
        y = 720
        for linea in lineas:
            c.drawString(60, y, linea)
            y -= 18
        c.showPage()
    c.save()
    return salida.getvalue()


@pytest.fixture(scope="module")
def cliente(monkeypatch_module):
    monkeypatch_module.setenv("ANONIMIZADOR_TOKEN", TOKEN)
    from servicio.app import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def monkeypatch_module():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


def _post(cliente, ruta, pdf, token=TOKEN, **form):
    return cliente.post(
        ruta,
        files={"file": ("h.pdf", pdf, "application/pdf")},
        data=form,
        headers={"X-Anonimizador-Token": token} if token else {},
    )


def test_sin_token_o_token_errado_es_401(cliente):
    pdf = _pdf(PAGINAS)
    assert _post(cliente, "/analyze", pdf, token=None).status_code == 401
    assert _post(cliente, "/analyze", pdf, token="otro").status_code == 401


def test_health_sin_token(cliente):
    assert cliente.get("/health").json() == {"ok": True}


def test_rechaza_lo_que_no_es_pdf(cliente):
    assert _post(cliente, "/analyze", b"hola, no soy un pdf").status_code == 415


def test_analyze_detecta_y_apply_oculta(cliente):
    r = _post(cliente, "/analyze", _pdf(PAGINAS))
    assert r.status_code == 200
    cuerpo = r.json()
    texto = cuerpo["text"]
    assert len(cuerpo["pages"]) == 2
    ocultos = {texto[s["start"]:s["end"]] for s in cuerpo["spans"]}
    assert any("Mariana" in o for o in ocultos)
    assert any("1023456789" in o for o in ocultos)
    assert any("3105557788" in o for o in ocultos)
    assert "Quintero" in {texto[s["start"]:s["end"]] for s in cuerpo["spans"] if s["start"] > cuerpo["pages"][1]["start"]}

    # El médico deja visible el teléfono y oculta a mano "mejoria" como nombre.
    finales = [s for s in cuerpo["spans"] if "3105557788" not in texto[s["start"]:s["end"]]]
    i = texto.index("mejoria")
    finales.append({"start": i, "end": i + len("mejoria"), "category": "nombres"})
    r = _post(cliente, "/apply", _pdf(PAGINAS), spans=json.dumps(finales), sha256=cuerpo["sha256"])
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"

    doc = fitz.open(stream=r.content, filetype="pdf")
    salida = "\n".join(p.get_text() for p in doc)
    assert doc.page_count == 2
    for dato in ("Mariana", "Quintero", "1023456789", "mariana.quintero", "mejoria"):
        assert dato not in salida
    assert "3105557788" in salida
    assert "[NOMBRE]" in salida and "[DOCUMENTO]" in salida


def test_apply_rechaza_otro_documento_y_tramos_invalidos(cliente):
    pdf = _pdf(PAGINAS)
    sha = _post(cliente, "/analyze", pdf).json()["sha256"]
    otro = _pdf([["Otro documento con otro texto distinto"]])
    assert _post(cliente, "/apply", otro, spans="[]", sha256=sha).status_code == 409
    assert _post(cliente, "/apply", pdf, spans="no-json", sha256=sha).status_code == 422
    malo = json.dumps([{"start": 0, "end": 10**7, "category": "nombres"}])
    assert _post(cliente, "/apply", pdf, spans=malo, sha256=sha).status_code == 422
    malo = json.dumps([{"start": 0, "end": 3, "category": "secretos"}])
    assert _post(cliente, "/apply", pdf, spans=malo, sha256=sha).status_code == 422
