/**
 * Lotes creados en este equipo. El registro solo guarda la carpeta y la fecha
 * (nunca nombres de archivo ni datos de pacientes); los totales se leen del
 * lote.sqlite de cada lote. Desde aquí se reanuda un lote en pausa (también
 * tras cerrar la app) o se abre en Revisión.
 */
import { useEffect, useState } from "react";
import { obtenerApi, type EntradaHistorial } from "../../api/escritorio";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { Spinner } from "../../components/Spinner/Spinner";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { plural } from "../anonimizar/formato";

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

export interface SeccionHistorialProps {
  onReanudar: (carpeta: string) => void;
  onRevisar: (carpeta: string) => void;
}

export function SeccionHistorial({ onReanudar, onRevisar }: SeccionHistorialProps) {
  const [lotes, setLotes] = useState<EntradaHistorial[] | null>(null);

  useEffect(() => {
    obtenerApi()
      .then((api) => api.historial())
      .then(setLotes);
  }, []);

  if (lotes === null) {
    return (
      <div className="anz-seccion">
        <Spinner label="Cargando historial…" />
      </div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="anz-seccion">
        <div className="anz-vacio">
          <span className="material-symbols-outlined" aria-hidden="true">
            {getIconGlyph("history")}
          </span>
          <p>Todavía no has anonimizado ningún lote en este equipo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="anz-seccion">
      <ul className="anz-lotes" aria-label="Lotes procesados">
        {lotes.map((l) => {
          const c = l.contadores;
          return (
            <li key={l.carpeta} className="anz-lote">
              <span className="material-symbols-outlined anz-lote__icono" aria-hidden="true">
                {getIconGlyph("folder")}
              </span>
              <div className="anz-lote__cuerpo">
                <span className="anz-lote__titulo">{l.creado ? FECHA.format(new Date(l.creado)) : "—"}</span>
                <span className="anz-lote__ruta" title={l.carpeta}>
                  {l.carpeta}
                </span>
                {c && (
                  <span className="anz-lote__badges">
                    <Badge tone="success" size="sm">
                      {plural(c.completados, "anonimizado", "anonimizados")}
                    </Badge>
                    {c.revisados > 0 && (
                      <Badge tone="info" size="sm">
                        {plural(c.revisados, "revisado", "revisados")}
                      </Badge>
                    )}
                    {c.errores > 0 && (
                      <Badge tone="error" size="sm">
                        {plural(c.errores, "con error", "con error")}
                      </Badge>
                    )}
                    {c.pendientes > 0 && (
                      <Badge tone={l.procesando ? "info" : "warning"} size="sm">
                        {l.procesando ? "procesando" : plural(c.pendientes, "pendiente", "pendientes")}
                      </Badge>
                    )}
                  </span>
                )}
              </div>
              {!l.existe ? (
                <span className="anz-nota">Carpeta movida o eliminada</span>
              ) : (
                <span className="anz-lote__acciones">
                  {c && c.pendientes > 0 && !l.procesando && (
                    <Button size="sm" onClick={() => onReanudar(l.carpeta)}>
                      Reanudar
                    </Button>
                  )}
                  {c && c.completados > 0 && (
                    <Button variant="outlined" size="sm" onClick={() => onRevisar(l.carpeta)}>
                      Revisar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => void (await obtenerApi()).abrir_ruta(l.carpeta)}
                  >
                    Abrir carpeta
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
