/**
 * Progreso del lote. Mismo lenguaje visual que `ModalAnonimizacion` del
 * frontend web (texto explicativo fijo, barra de progreso, filas con los 4
 * íconos de estado del DS: hourglass_top / progress_activity / check_circle /
 * error) -- aquí en la página en vez de en un modal, porque el lote puede ser
 * largo y es la única tarea de la app. Clases `man-*` de modalAnonimizacion.css.
 */
import { useEffect, useRef } from "react";
import type { EstadoDocumento, EstadoLote } from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";
import "../../styles/modalAnonimizacion.css";

const ICONO: Record<EstadoDocumento, IconName> = {
  pendiente: "hourglass_top",
  procesando: "progress_activity",
  completado: "check_circle",
  error: "error",
};

// Las clases de estado de modalAnonimizacion.css usan los nombres en inglés.
const CLASE: Record<EstadoDocumento, string> = {
  pendiente: "pending",
  procesando: "processing",
  completado: "success",
  error: "error",
};

const ETIQUETA: Record<EstadoDocumento, string> = {
  pendiente: "pendiente",
  procesando: "procesando",
  completado: "completado",
  error: "con error",
};

const EXPLICACION =
  "Protegemos la identidad y privacidad de los pacientes. La anonimización elimina los datos que pueden identificar a una persona, como nombres, documentos, direcciones o teléfonos. Todo el proceso ocurre en este equipo: ningún documento sale de él.";

export function PasoProcesando({ lote, onCancelar }: { lote: EstadoLote; onCancelar: () => void }) {
  const docs = lote.documentos;
  const terminados = docs.filter((d) => d.estado === "completado" || d.estado === "error").length;
  const errores = docs.filter((d) => d.estado === "error").length;
  const porcentaje = docs.length ? Math.round((terminados / docs.length) * 100) : 0;
  const actual = docs.find((d) => d.estado === "procesando");
  const filaActual = useRef<HTMLLIElement>(null);

  // Mantiene a la vista el documento en proceso en lotes largos.
  useEffect(() => {
    filaActual.current?.scrollIntoView({ block: "nearest" });
  }, [actual?.codigo]);

  return (
    <div className="anz-seccion">
      <section className="anz-tarjeta man-body" aria-labelledby="anz-proc-titulo">
        <div className="man-progress-block">
          <h2 id="anz-proc-titulo" className="anz-tarjeta__titulo">
            Anonimizando historias clínicas
          </h2>
          <p className="man-info">{EXPLICACION}</p>
          <div className="man-progress">
            <div
              className="man-progress__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={docs.length}
              aria-valuenow={terminados}
              aria-valuetext={
                errores > 0
                  ? `${terminados} de ${docs.length}, ${errores} con error`
                  : `${terminados} de ${docs.length}`
              }
            >
              <div className="man-progress__fill" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className="man-progress__label">
              {terminados} de {docs.length}
              {errores > 0 && <span className="man-progress__label-errors"> · {errores} con error</span>}
              {lote.cancelado && " · cancelando…"}
            </p>
          </div>
        </div>

        <ul className="man-file-list anz-lista-progreso" aria-label="Documentos del lote" aria-live="polite">
          {docs.map((d) => (
            <li
              key={d.codigo}
              ref={d.estado === "procesando" ? filaActual : undefined}
              className={`man-file-row man-file-row--${CLASE[d.estado]}`}
              aria-label={`${d.archivoOriginal}: ${ETIQUETA[d.estado]}`}
            >
              <span
                className={
                  "material-symbols-outlined man-file-row__icon" +
                  (d.estado === "procesando" ? " man-file-row__icon--spin" : "")
                }
                aria-hidden="true"
              >
                {getIconGlyph(ICONO[d.estado])}
              </span>
              <span className="man-file-row__name">{d.archivoOriginal}</span>
              {d.estado === "completado" && <span className="anz-codigo">{d.codigo}</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="anz-acciones">
        <Button variant="outlined" tone="danger" disabled={lote.cancelado} onClick={onCancelar}>
          Cancelar lote
        </Button>
      </div>
    </div>
  );
}
