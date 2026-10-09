/**
 * Lotes procesados en este equipo. El historial solo guarda totales y la
 * carpeta del lote (nunca nombres de archivo ni datos de pacientes), así que
 * para ver la relación de códigos se abre la carpeta.
 */
import { useEffect, useState } from "react";
import { obtenerApi, type EntradaHistorial } from "../../api/escritorio";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { Spinner } from "../../components/Spinner/Spinner";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { plural } from "../anonimizar/formato";

const FECHA = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

export function SeccionHistorial() {
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
        {lotes.map((l) => (
          <li key={l.carpeta} className="anz-lote">
            <span className="material-symbols-outlined anz-lote__icono" aria-hidden="true">
              {getIconGlyph("folder")}
            </span>
            <div className="anz-lote__cuerpo">
              <span className="anz-lote__titulo">{FECHA.format(new Date(l.fecha))}</span>
              <span className="anz-lote__ruta" title={l.carpeta}>
                {l.carpeta}
              </span>
              <span className="anz-lote__badges">
                <Badge tone="success" size="sm">
                  {plural(l.completados, "anonimizado", "anonimizados")}
                </Badge>
                {l.errores > 0 && (
                  <Badge tone="error" size="sm">
                    {plural(l.errores, "con error", "con error")}
                  </Badge>
                )}
                {l.cancelados > 0 && (
                  <Badge tone="neutral" size="sm">
                    {plural(l.cancelados, "cancelado", "cancelados")}
                  </Badge>
                )}
              </span>
            </div>
            {l.existe ? (
              <Button
                variant="outlined"
                size="sm"
                onClick={async () => void (await obtenerApi()).abrir_ruta(l.carpeta)}
              >
                Abrir carpeta
              </Button>
            ) : (
              <span className="anz-nota">Carpeta movida o eliminada</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
