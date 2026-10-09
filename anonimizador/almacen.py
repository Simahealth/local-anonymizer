"""Almacén SQLite de un lote: cola de trabajo persistente + datos de revisión.

Un archivo `lote.sqlite` por lote, en la carpeta del lote (junto a la tabla de
relación, fuera de `anonimizados/`). Guarda:

* `documentos`: un registro por PDF (código, nombre/ruta original, estado). Es
  la cola: el lote procesa los `pendiente` en orden, confirma cada documento
  apenas termina y, si la app se cierra a mitad de camino, al reabrirlo sigue
  donde iba. 50 000 filas son unos pocos MB.
* `textos`: el texto extraído de cada documento (con SALTO_PAGINA entre páginas).
* `tramos`: los fragmentos ocultados (automáticos o agregados a mano), sobre el
  texto original. El PDF anonimizado se regenera siempre a partir de texto +
  tramos activos, así que corregir un documento es editar sus tramos.

Contiene el texto ORIGINAL de las historias: es tan sensible como la tabla de
relación y debe tratarse igual (no compartirlo con los PDFs anonimizados).

Cada operación abre su propia conexión (las llamadas llegan desde varios hilos:
el del lote y los de la interfaz). Modo WAL: la interfaz puede leer mientras el
lote escribe.
"""

import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

VERSION_ESQUEMA = 1

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS meta (
    clave TEXT PRIMARY KEY,
    valor TEXT
);
CREATE TABLE IF NOT EXISTS documentos (
    id INTEGER PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    nombre_original TEXT NOT NULL,
    ruta_original TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente|procesando|completado|error
    error TEXT NOT NULL DEFAULT '',
    paginas INTEGER NOT NULL DEFAULT 0,
    total_pii INTEGER NOT NULL DEFAULT 0,
    revisado INTEGER NOT NULL DEFAULT 0,
    procesado_en TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_documentos_estado ON documentos(estado);
CREATE TABLE IF NOT EXISTS textos (
    documento_id INTEGER PRIMARY KEY REFERENCES documentos(id),
    texto TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tramos (
    id INTEGER PRIMARY KEY,
    documento_id INTEGER NOT NULL REFERENCES documentos(id),
    inicio INTEGER NOT NULL,
    fin INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    origen TEXT NOT NULL,              -- auto | manual
    activo INTEGER NOT NULL DEFAULT 1  -- 0 = revertido por el usuario (se muestra)
);
CREATE INDEX IF NOT EXISTS ix_tramos_documento ON tramos(documento_id);
"""

FILTROS = {
    "todos": "1",
    "completados": "estado = 'completado'",
    "errores": "estado = 'error'",
    "pendientes": "estado IN ('pendiente', 'procesando')",
    "revisados": "revisado = 1",
    "sin_revisar": "estado = 'completado' AND revisado = 0",
}


@dataclass
class TramoGuardado:
    id: int
    inicio: int
    fin: int
    categoria: str
    origen: str
    activo: bool


class Almacen:
    NOMBRE = "lote.sqlite"

    def __init__(self, carpeta: Path):
        self.ruta = Path(carpeta) / self.NOMBRE
        self._escritura = threading.Lock()
        with self._conexion() as c:
            c.execute("PRAGMA journal_mode=WAL")
            c.executescript(_ESQUEMA)
            c.execute(
                "INSERT OR IGNORE INTO meta VALUES ('version_esquema', ?)", (str(VERSION_ESQUEMA),)
            )

    @staticmethod
    def existe(carpeta: Path) -> bool:
        return (Path(carpeta) / Almacen.NOMBRE).exists()

    @contextmanager
    def _conexion(self) -> Iterator[sqlite3.Connection]:
        c = sqlite3.connect(self.ruta, timeout=30)
        c.row_factory = sqlite3.Row
        try:
            with c:  # transacción: commit al salir, rollback si hay excepción
                yield c
        finally:
            c.close()

    @contextmanager
    def _escribiendo(self) -> Iterator[sqlite3.Connection]:
        with self._escritura, self._conexion() as c:
            yield c

    # ------------------------------------------------------------------ #
    # Meta
    # ------------------------------------------------------------------ #

    def meta(self, clave: str, defecto: str = "") -> str:
        with self._conexion() as c:
            fila = c.execute("SELECT valor FROM meta WHERE clave = ?", (clave,)).fetchone()
        return fila["valor"] if fila else defecto

    def fijar_meta(self, clave: str, valor: str) -> None:
        with self._escribiendo() as c:
            c.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (clave, valor))

    # ------------------------------------------------------------------ #
    # Cola
    # ------------------------------------------------------------------ #

    def agregar_documentos(self, filas: list[tuple[str, str, str]]) -> None:
        """filas: (codigo, nombre_original, ruta_original), en orden de proceso."""
        with self._escribiendo() as c:
            c.executemany(
                "INSERT INTO documentos (codigo, nombre_original, ruta_original) VALUES (?, ?, ?)",
                filas,
            )

    def codigos(self) -> set[str]:
        with self._conexion() as c:
            return {f[0] for f in c.execute("SELECT codigo FROM documentos")}

    def reiniciar_interrumpidos(self) -> None:
        """Un documento que quedó 'procesando' (la app se cerró a mitad) vuelve a la cola."""
        with self._escribiendo() as c:
            c.execute("UPDATE documentos SET estado = 'pendiente' WHERE estado = 'procesando'")

    def siguiente_pendiente(self) -> sqlite3.Row | None:
        with self._conexion() as c:
            return c.execute(
                "SELECT * FROM documentos WHERE estado = 'pendiente' ORDER BY id LIMIT 1"
            ).fetchone()

    def marcar_procesando(self, doc_id: int) -> None:
        with self._escribiendo() as c:
            c.execute("UPDATE documentos SET estado = 'procesando' WHERE id = ?", (doc_id,))

    def guardar_resultado(
        self, doc_id: int, texto: str, tramos: list[tuple[int, int, str]], paginas: int, fecha: str
    ) -> None:
        with self._escribiendo() as c:
            c.execute("INSERT OR REPLACE INTO textos VALUES (?, ?)", (doc_id, texto))
            c.execute("DELETE FROM tramos WHERE documento_id = ?", (doc_id,))
            c.executemany(
                "INSERT INTO tramos (documento_id, inicio, fin, categoria, origen) "
                "VALUES (?, ?, ?, ?, 'auto')",
                [(doc_id, i, f, cat) for i, f, cat in tramos],
            )
            c.execute(
                "UPDATE documentos SET estado = 'completado', error = '', paginas = ?, "
                "total_pii = ?, procesado_en = ? WHERE id = ?",
                (paginas, len(tramos), fecha, doc_id),
            )

    def guardar_error(self, doc_id: int, error: str, fecha: str) -> None:
        with self._escribiendo() as c:
            c.execute(
                "UPDATE documentos SET estado = 'error', error = ?, procesado_en = ? WHERE id = ?",
                (error, fecha, doc_id),
            )

    def contadores(self) -> dict[str, int]:
        with self._conexion() as c:
            cuenta = {f["estado"]: f["n"] for f in c.execute(
                "SELECT estado, COUNT(*) AS n FROM documentos GROUP BY estado"
            )}
            revisados = c.execute("SELECT COUNT(*) FROM documentos WHERE revisado = 1").fetchone()[0]
            pii = c.execute("SELECT COALESCE(SUM(total_pii), 0) FROM documentos").fetchone()[0]
        return {
            "total": sum(cuenta.values()),
            "completados": cuenta.get("completado", 0),
            "errores": cuenta.get("error", 0),
            "pendientes": cuenta.get("pendiente", 0) + cuenta.get("procesando", 0),
            "revisados": revisados,
            "datosOcultados": pii,
        }

    # ------------------------------------------------------------------ #
    # Consulta (interfaz)
    # ------------------------------------------------------------------ #

    def listar(
        self, offset: int, limite: int, filtro: str = "todos", busqueda: str = ""
    ) -> tuple[int, list[sqlite3.Row]]:
        donde = FILTROS.get(filtro, "1")
        params: list = []
        if busqueda.strip():
            donde += " AND (codigo LIKE ? OR nombre_original LIKE ?)"
            params += [f"%{busqueda.strip()}%"] * 2
        with self._conexion() as c:
            total = c.execute(f"SELECT COUNT(*) FROM documentos WHERE {donde}", params).fetchone()[0]
            filas = c.execute(
                f"SELECT * FROM documentos WHERE {donde} ORDER BY id LIMIT ? OFFSET ?",
                [*params, limite, offset],
            ).fetchall()
        return total, filas

    def documento(self, codigo: str) -> sqlite3.Row | None:
        with self._conexion() as c:
            return c.execute("SELECT * FROM documentos WHERE codigo = ?", (codigo,)).fetchone()

    def texto(self, doc_id: int) -> str:
        with self._conexion() as c:
            fila = c.execute("SELECT texto FROM textos WHERE documento_id = ?", (doc_id,)).fetchone()
        return fila["texto"] if fila else ""

    def tramos(self, doc_id: int) -> list[TramoGuardado]:
        with self._conexion() as c:
            return [
                TramoGuardado(f["id"], f["inicio"], f["fin"], f["categoria"], f["origen"], bool(f["activo"]))
                for f in c.execute(
                    "SELECT * FROM tramos WHERE documento_id = ? ORDER BY inicio, fin", (doc_id,)
                )
            ]

    def iterar_documentos(self) -> Iterator[sqlite3.Row]:
        """Todos los documentos en orden, sin cargarlos todos en memoria."""
        c = sqlite3.connect(self.ruta, timeout=30)
        c.row_factory = sqlite3.Row
        try:
            yield from c.execute("SELECT * FROM documentos ORDER BY id")
        finally:
            c.close()

    # ------------------------------------------------------------------ #
    # Correcciones (revisión)
    # ------------------------------------------------------------------ #

    def reemplazar_tramos(
        self, doc_id: int, eliminar: list[int], nuevos: list[tuple[int, int, str]]
    ) -> None:
        with self._escribiendo() as c:
            c.executemany("DELETE FROM tramos WHERE id = ? AND documento_id = ?",
                          [(i, doc_id) for i in eliminar])
            c.executemany(
                "INSERT INTO tramos (documento_id, inicio, fin, categoria, origen) "
                "VALUES (?, ?, ?, ?, 'manual')",
                [(doc_id, i, f, cat) for i, f, cat in nuevos],
            )
            self._actualizar_total(c, doc_id)

    def actualizar_tramo(
        self, doc_id: int, tramo_id: int, activo: bool | None = None, categoria: str | None = None
    ) -> None:
        with self._escribiendo() as c:
            if activo is not None:
                c.execute("UPDATE tramos SET activo = ? WHERE id = ? AND documento_id = ?",
                          (int(activo), tramo_id, doc_id))
            if categoria is not None:
                c.execute("UPDATE tramos SET categoria = ? WHERE id = ? AND documento_id = ?",
                          (categoria, tramo_id, doc_id))
            self._actualizar_total(c, doc_id)

    @staticmethod
    def _actualizar_total(c: sqlite3.Connection, doc_id: int) -> None:
        c.execute(
            "UPDATE documentos SET total_pii = "
            "(SELECT COUNT(*) FROM tramos WHERE documento_id = ? AND activo = 1) WHERE id = ?",
            (doc_id, doc_id),
        )

    def marcar_revisado(self, doc_id: int, revisado: bool) -> None:
        with self._escribiendo() as c:
            c.execute("UPDATE documentos SET revisado = ? WHERE id = ?", (int(revisado), doc_id))
