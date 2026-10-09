/**
 * Fin (o pausa) de un lote: totales, accesos a las carpetas y a la revisión.
 * Los errores se listan (los primeros) porque son los que piden atención; el
 * detalle de cada documento está en Revisión.
 */
import { useEffect, useState } from "react";
import { obtenerApi, type EstadoLote, type ResumenDocumento } from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { useToast } from "../../components/Toast/useToast";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";

const icono = (nombre: Parameters<typeof getIconGlyph>[0]) => (
  <span className="material-symbols-outlined" aria-hidden="true">
    {getIconGlyph(nombre)}
  </span>
);

export interface PasoResultadoProps {
  lote: EstadoLote;
  onNuevoLote: () => void;
  onReanudar: () => void;
  onRevisar: (carpeta: string) => void;
}

export function PasoResultado({ lote, onNuevoLote, onReanudar, onRevisar }: PasoResultadoProps) {
  const toast = useToast();
  const c = lote.contadores;
  const pausado = c.pendientes > 0;
  const [errores, setErrores] = useState<ResumenDocumento[]>([]);

  useEffect(() => {
    if (c.errores === 0) return;
    void obtenerApi()
      .then((api) => api.documentos(lote.carpeta, 0, 50, "errores", ""))
      .then((r) => setErrores(r.documentos));
  }, [lote.carpeta, c.errores]);

  async function abrir(ruta: string) {
    const ok = await (await obtenerApi()).abrir_ruta(ruta);
    if (!ok) toast.show({ tone: "error", message: "No se encontró la ruta", description: ruta });
  }

  return (
    <div className="anz-seccion">
      {pausado && (
        <p className="anz-aviso anz-aviso--info">
          {icono("pause")}
          <span>
            <strong>Lote en pausa.</strong> Quedan {c.pendientes.toLocaleString("es-CO")} documentos por procesar. Puedes
            continuar ahora o más tarde desde el Historial, incluso después de cerrar la app.
          </span>
        </p>
      )}

      <div className="anz-resumen" role="group" aria-label="Resumen del lote">
        <div className="anz-resumen__dato">
          <span className="anz-resumen__valor">{c.completados.toLocaleString("es-CO")}</span>
          <span className="anz-resumen__etiqueta">anonimizados</span>
        </div>
        <div className="anz-resumen__dato">
          <span className={"anz-resumen__valor" + (c.errores ? " anz-resumen__valor--error" : "")}>
            {c.errores.toLocaleString("es-CO")}
          </span>
          <span className="anz-resumen__etiqueta">con error</span>
        </div>
        {pausado && (
          <div className="anz-resumen__dato">
            <span className="anz-resumen__valor">{c.pendientes.toLocaleString("es-CO")}</span>
            <span className="anz-resumen__etiqueta">pendientes</span>
          </div>
        )}
        <div className="anz-resumen__dato">
          <span className="anz-resumen__valor">{c.datosOcultados.toLocaleString("es-CO")}</span>
          <span className="anz-resumen__etiqueta">datos personales ocultados</span>
        </div>
      </div>

      <p className="anz-aviso anz-aviso--advertencia">
        {icono("warning")}
        <span>
          <strong>La tabla de relación y los datos de revisión permiten volver a identificar a cada paciente.</strong>{" "}
          Comparte solo la carpeta <em>anonimizados</em>; el resto del lote guárdalo en un lugar seguro.
        </span>
      </p>

      <div className="anz-acciones anz-acciones--inicio">
        {pausado && (
          <Button iconLeft={icono("play_arrow")} onClick={onReanudar}>
            Reanudar
          </Button>
        )}
        <Button
          variant={pausado ? "outlined" : "main"}
          iconLeft={icono("visibility")}
          onClick={() => onRevisar(lote.carpeta)}
          disabled={c.completados === 0}
        >
          Revisar documentos
        </Button>
        <Button variant="outlined" iconLeft={icono("folder")} onClick={() => abrir(lote.carpetaPdfs)}>
          PDFs anonimizados
        </Button>
        <Button variant="outlined" iconLeft={icono("table_rows")} onClick={() => abrir(lote.relacionXlsx)}>
          Tabla de relación
        </Button>
        <Button variant="ghost" onClick={() => abrir(lote.carpeta)}>
          Carpeta del lote
        </Button>
        <Button variant="outlined" className="anz-acciones__derecha" iconLeft={icono("add")} onClick={onNuevoLote}>
          Nuevo lote
        </Button>
      </div>

      {errores.length > 0 && (
        <section className="anz-tarjeta" aria-labelledby="anz-errores-titulo">
          <h2 id="anz-errores-titulo" className="anz-tarjeta__titulo">
            Documentos con error
            <span className="anz-tarjeta__meta">
              {" "}
              · {c.errores.toLocaleString("es-CO")}
              {c.errores > errores.length && ` (primeros ${errores.length})`}
            </span>
          </h2>
          <div className="anz-tabla-contenedor">
            <table className="anz-tabla">
              <thead>
                <tr>
                  <th scope="col">Archivo original</th>
                  <th scope="col">Código</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {errores.map((d) => (
                  <tr key={d.codigo}>
                    <td className="anz-tabla__archivo">{d.nombreOriginal}</td>
                    <td>
                      <span className="anz-codigo">{d.codigo}</span>
                    </td>
                    <td className="anz-tabla__error-celda">{d.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
