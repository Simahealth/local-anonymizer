"""Casos de fuga reales encontrados al probar el motor (dataset AME sintético)."""


def anonimo(anonimizador, texto):
    return anonimizador.anonimizar_texto(texto)[0]


def test_nombre_parcial_se_expande_a_apellidos(anonimizador):
    salida = anonimo(anonimizador, "CONTROL. PACIENTE JESSICA JURADO MINA VALORADO POR DR OSCAR MANSUR ZAMBRANO (RM 53952).")
    for palabra in ("JESSICA", "JURADO", "MINA", "MANSUR", "ZAMBRANO", "53952"):
        assert palabra not in salida
    assert "VALORADO POR" in salida


def test_apellido_compuesto(anonimizador):
    salida = anonimo(anonimizador, "EVOLUCION DIA 2 DR ANDERSON DE LA ROSA GRUESO PEDIATRA DE TURNO.")
    assert "ROSA" not in salida and "GRUESO" not in salida
    assert "PEDIATRA DE TURNO" in salida


def test_nombre_tras_ancla_sin_gazetteer(anonimizador):
    salida = anonimo(anonimizador, "INGRESO: PACIENTE FAIVER MINA OYAGA (RECIEN NACIDO PRETERMINO).")
    assert "FAIVER" not in salida and "OYAGA" not in salida


def test_texto_clinico_tras_paciente_no_se_redacta(anonimizador):
    salida = anonimo(anonimizador, "PACIENTE HEMODINAMICAMENTE ESTABLE, AFEBRIL, TOLERA VIA ORAL.")
    assert "HEMODINAMICAMENTE ESTABLE" in salida


def test_direccion_con_avenida_y_manzana(anonimizador):
    salida = anonimo(anonimizador, "Dirección: Av 18 No. 85-30, barrio Manga\nOtra: Manzana 14 Casa 11, La Floresta")
    assert "85-30" not in salida and "Casa 11" not in salida


def test_extractor_no_parte_correos():
    from anonimizador.extractor import ExtractorPDF

    e = ExtractorPDF()
    assert e._separar_digito_letra("correo chaverra893@outlook.com y tel 3208914106direccion") == (
        "correo chaverra893@outlook.com y tel 3208914106 direccion"
    )


def test_sin_trafico_de_red_al_validar_correos(anonimizador, monkeypatch):
    """tldextract no debe intentar descargar la lista de sufijos de dominio."""
    import socket

    def sin_red(*_a, **_k):
        raise AssertionError("intento de conexión de red")

    monkeypatch.setattr(socket.socket, "connect", sin_red)
    salida = anonimo(anonimizador, "Correo de contacto: paciente.prueba@hospital.gov.co")
    assert "hospital.gov.co" not in salida
