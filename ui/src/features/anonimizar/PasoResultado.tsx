import { obtenerApi, type DocumentoLote, type EstadoLote } from "../../api/escritorio";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { useToast } from "../../components/Toast/useToast";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { NOMBRES_CATEGORIA, plural } from "./formato";

function EstadoDoc({ doc }: { doc: DocumentoLote }) {
  if (doc.estado === "completado") return <Badge tone="success" size="sm">Anonimizado</Badge>;
  if (doc.estado === "error") return <Badge tone="error" size="sm">Error</Badge>;
  return <Badge tone="neutral" size="sm">Cancelado</Badge>;
}

function detalle(doc: DocumentoLote): string {
  return Object.entries(doc.piiPorCategoria)
    .map(([cat, n]) => `${NOMBRES_CATEGORIA[cat] ?? cat}: ${n}`)
    .join(" · ");
}

export function PasoResultado({ lote, onNuevoLote }: { lote: EstadoLote; onNuevoLote: () => void }) {
  const toast = useToast();
  const docs = lote.documentos;
  const completados = docs.filter((d) => d.estado === "completado").length;
  const errores = docs.filter((d) => d.estado === "error").length;
  const cancelados = docs.length - completados - errores;
  const datos = docs.reduce((s, d) => s + d.totalPii, 0);

  async function abrir(ruta: string) {
    const ok = await (await obtenerApi()).abrir_ruta(ruta);
    if (!ok) toast.show({ tone: "error", message: "No se encontró la ruta", description: ruta });
  }

  return (
    <div className="anz-seccion">
      <div className="anz-resumen" role="group" aria-label="Resumen del lote">
        <div className="anz-resumen__dato">
          <span className="anz-resumen__valor">{completados}</span>
          <span className="anz-resumen__etiqueta">anonimizados</span>
        </div>
        <div className="anz-resumen__dato">
          <span className={"anz-resumen__valor" + (errores ? " anz-resumen__valor--error" : "")}>{errores}</span>
          <span className="anz-resumen__etiqueta">con error</span>
        </div>
        {cancelados > 0 && (
          <div className="anz-resumen__dato">
            <span className="anz-resumen__valor">{cancelados}</span>
            <span className="anz-resumen__etiqueta">cancelados</span>
          </div>
        )}
        <div className="anz-resumen__dato">
          <span className="anz-resumen__valor">{datos.toLocaleString("es-CO")}</span>
          <span className="anz-resumen__etiqueta">datos personales ocultados</span>
        </div>
      </div>

      <p className="anz-aviso anz-aviso--advertencia">
        <span className="material-symbols-outlined" aria-hidden="true">
          {getIconGlyph("warning")}
        </span>
        <span>
          <strong>La tabla de relación permite volver a identificar a cada paciente.</strong> Guárdala en un
          lugar seguro y no la compartas junto con los PDFs anonimizados.
        </span>
      </p>

      <div className="anz-acciones anz-acciones--inicio">
        <Button
          iconLeft={
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("folder")}
            </span>
          }
          onClick={() => abrir(lote.carpetaPdfs)}
          disabled={completados === 0}
        >
          Abrir PDFs anonimizados
        </Button>
        <Button
          variant="outlined"
          iconLeft={
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("table_rows")}
            </span>
          }
          onClick={() => abrir(lote.relacionXlsx)}
        >
          Abrir tabla de relación
        </Button>
        <Button variant="ghost" onClick={() => abrir(lote.carpeta)}>
          Abrir carpeta del lote
        </Button>
        <Button
          variant="outlined"
          className="anz-acciones__derecha"
          iconLeft={
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("add")}
            </span>
          }
          onClick={onNuevoLote}
        >
          Nuevo lote
        </Button>
      </div>

      <section className="anz-tarjeta" aria-labelledby="anz-relacion-titulo">
        <div className="anz-tarjeta__cabecera">
          <h2 id="anz-relacion-titulo" className="anz-tarjeta__titulo">
            Relación de códigos
            <span className="anz-tarjeta__meta"> · {plural(docs.length, "documento", "documentos")}</span>
          </h2>
        </div>
        <div className="anz-tabla-contenedor">
          <table className="anz-tabla">
            <thead>
              <tr>
                <th scope="col">Archivo original</th>
                <th scope="col">Código</th>
                <th scope="col">Estado</th>
                <th scope="col" className="anz-tabla__num">
                  Datos ocultados
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.codigo}>
                  <td className="anz-tabla__archivo" title={d.rutaOriginal}>
                    {d.archivoOriginal}
                    {d.error && <span className="anz-tabla__error">{d.error}</span>}
                  </td>
                  <td>
                    <span className="anz-codigo">{d.codigo}</span>
                  </td>
                  <td>
                    <EstadoDoc doc={d} />
                  </td>
                  <td className="anz-tabla__num" title={detalle(d)}>
                    {d.estado === "completado" ? d.totalPii : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
