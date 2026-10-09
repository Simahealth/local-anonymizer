import re
import unicodedata
from pathlib import Path

import pymupdf as fitz


class PDFProtegido(Exception):
    """El PDF está cifrado con contraseña de apertura."""


class ExtractorPDF:
    """Extrae texto limpio de un PDF usando PyMuPDF."""

    def extraer(self, ruta_pdf: Path) -> str:
        """Extrae y limpia el texto de todas las páginas del PDF.

        Extracción consciente del layout: en vez de volcar `get_text()` en el
        orden del flujo del PDF, se trabaja con bloques (`get_text("blocks")`)
        ordenados por su geometría de lectura (arriba→abajo, izquierda→derecha).
        Así un eventual documento a dos columnas no intercala los textos. El
        reflujo de los saltos de línea suaves —para que los nombres partidos por
        el wrap visual (p. ej. la firma "...moncaris\\ngonzalez fecha") vuelvan a
        quedar contiguos— se hace después, sobre el texto completo (ver `_limpiar`),
        porque una frase puede partirse también entre dos bloques contiguos.
        """
        doc = fitz.open(str(ruta_pdf))
        if doc.needs_pass:
            doc.close()
            raise PDFProtegido(str(ruta_pdf))
        paginas = [self._texto_pagina(page) for page in doc]
        doc.close()
        return self._limpiar("\n".join(paginas))

    def _texto_pagina(self, page) -> str:
        """Devuelve el texto de una página con los bloques en orden de lectura."""
        bloques = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:  # 0 = texto (1 = imagen)
                continue
            texto = self._unir_lineas_ajustadas(b)
            if texto.strip():
                # Misma forma que get_text("blocks"): (x0, y0, x1, y1, texto).
                bloques.append((*b["bbox"], texto))
        bloques = self._ordenar_lectura(bloques)
        return "\n".join(b[4].strip() for b in bloques)

    # Una línea que llega a este margen (fracción del ancho del bloque) desde el
    # borde derecho se considera llena: el renglón siguiente es su continuación.
    _MARGEN_AJUSTE = 0.15
    # Inicio de un campo "Etiqueta: valor": nunca es continuación de la línea anterior.
    _RE_CAMPO = re.compile(r"^[^\W\d][^:\n]{0,30}:")

    def _unir_lineas_ajustadas(self, bloque: dict) -> str:
        """Une las líneas de un bloque que el PDF partió por el ancho de página.

        El texto de un párrafo llega renglón por renglón, y un nombre puede
        quedar partido ("…DE VIDA DR ANDERSON\nDE LA ROSA GRUESO PEDIATRA",
        "…su acudiente, Leidy Chaverra\nOyaga, de 19 años"). Ningún reconocedor
        cruza ese salto, así que "ROSA GRUESO" / "Oyaga" quedaban sin redactar.
        `_reflujo` solo detecta el ajuste cuando la línea siguiente empieza en
        minúscula; aquí se usa la geometría, que no depende de las mayúsculas:
        si una línea llega hasta el borde derecho del bloque, el salto es de
        ajuste y se une con un espacio. Las líneas cortas (campos de cabecera
        como "Id Cliente" / "401924") y los inicios de "Etiqueta:" se conservan.
        """
        lineas = [
            (l["bbox"], "".join(s["text"] for s in l["spans"]).strip())
            for l in bloque["lines"]
        ]
        lineas = [(bbox, t) for bbox, t in lineas if t]
        if not lineas:
            return ""
        x0, _, x1, _ = bloque["bbox"]
        limite = x1 - self._MARGEN_AJUSTE * (x1 - x0)

        partes = [lineas[0][1]]
        for (bbox_prev, texto_prev), (_, texto) in zip(lineas, lineas[1:]):
            ajustada = (
                bbox_prev[2] >= limite
                and not texto_prev.endswith("-")  # guion de corte: lo resuelve _reflujo
                and not self._RE_CAMPO.match(texto)
            )
            partes.append(" " if ajustada else "\n")
            partes.append(texto)
        return "".join(partes)

    def _ordenar_lectura(self, bloques: list) -> list:
        """Ordena los bloques por orden de lectura: banda vertical, luego columna.

        Para una sola columna (el caso de estas HC) equivale a arriba→abajo. Si un
        documento trae varias columnas, los bloques de cada banda vertical se
        ordenan de izquierda a derecha, evitando que las columnas se intercalen.
        El redondeo de y0 absorbe el jitter de línea base entre bloques contiguos.
        """
        return sorted(bloques, key=lambda b: (round(b[1]), round(b[0])))

    def _reflujo(self, texto: str) -> str:
        """Reúne tokens partidos por el salto de línea: wrap suave y guion de corte.

        Dos casos, evaluados contra la línea anterior:

        * Guion de corte ("Gonzá-\\nlez" → "González"): la línea termina en
          ``letra-`` y la siguiente empieza en minúscula → se unen SIN espacio y se
          elimina el guion. Exige letra justo antes del guion para no tocar guiones
          de viñeta o de rango ("- item", "2018 - 2020").
        * Wrap suave ("...moncaris\\ngonzalez fecha"): la línea termina en minúscula
          o coma y la siguiente empieza en minúscula → eran la misma frase partida
          por el ancho de página y se unen con un espacio.

        Las líneas "clave: valor" de la cabecera (terminan en dígito o dos puntos) y
        los límites entre consultas se conservan, porque "Id. Consulta:", "Fecha de
        Registro:" e "Identificador..." arrancan en mayúscula.
        """
        salida: list[str] = []
        for linea in texto.split("\n"):
            linea = linea.rstrip()
            empieza_min = bool(linea) and bool(re.match(rf"[{self._LETRA_MIN}]", linea))
            if salida and empieza_min and re.search(rf"[{self._LETRA_MIN}]-$", salida[-1]):
                salida[-1] = salida[-1][:-1] + linea  # guion de corte: une sin espacio
            elif salida and empieza_min and re.search(rf"[{self._LETRA_MIN},]$", salida[-1]):
                salida[-1] += " " + linea  # wrap suave: une con espacio
            else:
                salida.append(linea)
        return "\n".join(salida)

    # Letras (incl. tildes/Ñ) para detectar transiciones dígito↔letra.
    _LETRA = r"A-Za-zÁÉÍÓÚÜÑáéíóúüñ"
    # Solo minúsculas: marca de salto de línea "suave" (wrap a media frase).
    _LETRA_MIN = r"a-záéíóúüñ"

    # Etiquetas de sección/campo de la plantilla del EHR que el PDF de origen
    # emite fundidas con la palabra anterior, sin espacio ("gonzalezfecha",
    # "mentalespaciente", "surbarrio", "objetivosplan"). Forman un vocabulario
    # cerrado y distintivo: reinsertar el espacio recupera el token pegado —
    # crítico para el apellido del médico en la firma "...por <nombre>fecha"—
    # sin trocear palabras reales.
    #
    # Se excluyen a propósito términos que son sufijo de palabras comunes y que
    # se romperían con un corte ingenuo: "edad" (enfermedad), "social"
    # (psicosocial), "clasificacion" (hemoclasificacion), "patologico"
    # (fisiopatologico). El corte solo ocurre cuando la etiqueta va pegada a una
    # letra previa (no tras un espacio), así que el texto bien separado no se toca.
    _ETIQUETAS = (
        "fecha", "paciente", "acompanante", "barrio", "estrato", "localidad",
        "diagnosticos", "diagnostico", "nacimiento", "direccion", "telefono",
        "antecedentes", "enfermedad", "examen", "motivo", "analisis", "perinatal",
        "quirurgico", "farmacologicos", "alergicos", "toxicos", "transfusiones",
        "inmunizacion", "habitos", "conducta", "tratamiento", "plan",
    )
    _RE_ETIQUETAS = re.compile(
        rf"(?<=[{_LETRA}])(?=(?:{'|'.join(_ETIQUETAS)})\b)"
    )

    def _limpiar(self, texto: str) -> str:
        """Normaliza unicode, elimina caracteres de control y colapsa saltos de línea."""
        if not texto:
            return texto
        texto = unicodedata.normalize("NFKC", texto)
        texto = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", texto)
        texto = self._separar_digito_letra(texto)
        texto = self._separar_etiquetas_pegadas(texto)
        texto = texto.replace("\r\n", "\n").replace("\r", "\n")
        texto = self._reflujo(texto)
        texto = re.sub(r"\n{3,}", "\n\n", texto)
        texto = re.sub(r"[ \t]+$", "", texto, flags=re.MULTILINE)
        return texto.strip()

    def _separar_etiquetas_pegadas(self, texto: str) -> str:
        """Inserta un espacio antes de una etiqueta de campo fundida con la palabra previa.

        El export del EHR pega valores de campo sin separador ("gonzalezfecha",
        "mentalespaciente"). Reinsertar el espacio en la frontera devuelve a cada
        token su identidad para los reconocedores (sobre todo el apellido del
        médico en la firma). Ver `_ETIQUETAS` para el alcance y las exclusiones.
        """
        return self._RE_ETIQUETAS.sub(" ", texto)

    def _separar_digito_letra(self, texto: str) -> str:
        """Inserta un espacio en las transiciones dígito↔letra.

        Estas historias clínicas vienen con campos pegados en el propio PDF
        ("3208914106direccion", "1030630690tel", "2013edad", "32barrio"). Separar
        en la frontera dígito/letra recupera teléfonos y cédulas que de otro modo
        quedan fundidos con la palabra siguiente; no afecta a fechas (dígito-dígito)
        ni a documentos con separadores de miles.

        Los correos se dejan intactos: partir "chaverra893@outlook.com" en
        "chaverra 893@outlook.com" hacía que el reconocedor de email solo viera
        "893@outlook.com" y el usuario ("chaverra", un apellido) quedara visible.
        """
        partes = self._RE_EMAIL.split(texto)
        correos = self._RE_EMAIL.findall(texto)
        for i, parte in enumerate(partes):
            parte = re.sub(rf"(?<=\d)(?=[{self._LETRA}])", " ", parte)
            partes[i] = re.sub(rf"(?<=[{self._LETRA}])(?=\d)", " ", parte)
        return "".join(p + c for p, c in zip(partes, correos + [""]))

    _RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
