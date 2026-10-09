from anonimizador.reemplazador import Reemplazador

r = Reemplazador()


def vacio(**cats):
    base = {c: set() for c in (
        "nombres", "documentos", "telefonos", "fechas_nacimiento", "direcciones", "emails",
        "fechas", "edades", "ubicaciones", "seguros", "numeros_registro")}
    base.update({k: set(v) for k, v in cats.items()})
    return base


def test_no_reemplaza_dentro_de_otra_palabra():
    texto = "Reside en Cali. Calidad de vida buena."
    assert r.reemplazar(texto, vacio(ubicaciones={"Cali"})) == "Reside en [UBICACION]. Calidad de vida buena."


def test_numero_no_se_reemplaza_dentro_de_otro():
    assert r.reemplazar("Edad 21 años, año 2021", vacio(edades={"21 años"})) == "Edad [EDAD], año 2021"


def test_numero_corto_suelto_no_se_propaga():
    # Un "3" solo no se busca en todo el texto: destruiría dosis y días.
    texto = "3 ml cada 3 horas"
    assert r.reemplazar(texto, vacio(edades={"3"})) == texto


def test_ignora_mayusculas():
    texto = "Vive en Bogotá. Remitido a BOGOTÁ."
    assert r.reemplazar(texto, vacio(ubicaciones={"Bogotá"})) == "Vive en [UBICACION]. Remitido a [UBICACION]."


def test_solape_parcial_entre_categorias_no_deja_restos():
    # spaCy marcó un tramo que corta la dirección a la mitad.
    texto = "Procedencia: Cundinamarca\nDirección: Cra 45C N° 20-98 piso 4, barrio"
    pii = vacio(
        ubicaciones={"Cundinamarca\nDirección: Cra 45C N"},
        direcciones={"Cra 45C N° 20-98 piso 4"},
    )
    salida = r.reemplazar(texto, pii)
    assert "20-98" not in salida and "piso 4" not in salida


def test_valor_largo_no_queda_partido_por_uno_corto():
    texto = "Atendido por DR OSCAR CORTÉS JURADO hoy."
    pii = vacio(nombres={"OSCAR CORTÉS"}, ubicaciones={"DR OSCAR CORTÉS JURADO"})
    assert "JURADO" not in r.reemplazar(texto, pii)


def test_documento_con_prefijo():
    assert r.reemplazar("CC: 1067618172 vigente", vacio(documentos={"1067618172"})) == "[DOCUMENTO] vigente"


def test_propaga_apellidos_con_mayuscula_inicial():
    texto = "Paciente: Laura Gómez Ríos. Control: la paciente Gómez mejora. Intestino grueso normal."
    salida = r.reemplazar(texto, vacio(nombres={"Laura Gómez Ríos", "Ana Grueso"}))
    assert "Gómez" not in salida
    assert "Intestino grueso" in salida  # minúscula: palabra común, no se toca


def test_colapsa_etiquetas_contiguas():
    assert r.reemplazar("Dr Juan Pérez", vacio(nombres={"Juan", "Pérez"})) == "Dr [NOMBRE]"
