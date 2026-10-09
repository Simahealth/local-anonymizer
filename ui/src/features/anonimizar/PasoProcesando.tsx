/**
 * Progreso del lote. Mismo lenguaje visual que `ModalAnonimizacion` del
 * frontend web (texto explicativo fijo, barra de progreso, filas con los 4
 * íconos de estado del DS) -- aquí en la página, porque el lote puede durar
 * horas. Con lotes de miles de documentos no se lista todo: solo el documento
 * en curso y los últimos procesados, más velocidad, tiempo restante y memoria.
 */
import type { EstadoDocumento, EstadoLote, EventoDocumento } from "../../api/escritorio";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";
import { formatearDuracion, formatearMb } from "./formato";
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

const EXPLICACION =
  "Protegemos la identidad y privacidad de los pacientes. La anonimización elimina los datos que pueden identificar a una persona, como nombres, documentos, direcciones o teléfonos. Todo ocurre en este equipo y el avance se guarda después de cada documento.";

function Fila({ evento }: { evento: EventoDocumento }) {
  return (
    <li
      className={`man-file-row man-file-row--${CLASE[evento.estado]}`}
      aria-label={`${evento.nombre}: ${evento.estado}`}
    >
      <span
        className={
          "material-symbols-outlined man-file-row__icon" +
          (evento.estado === "procesando" ? " man-file-row__icon--spin" : "")
        }
        aria-hidden="true"
      >
        {getIconGlyph(ICONO[evento.estado])}
      </span>
      <span className="man-file-row__name" title={evento.error || undefined}>
        {evento.nombre}
      </span>
      {evento.estado === "completado" && <span className="anz-codigo">{evento.codigo}</span>}
      {evento.estado === "error" && <span className="anz-fila-error">con error</span>}
    </li>
  );
}

export function PasoProcesando({ lote, onPausar }: { lote: EstadoLote; onPausar: () => void }) {
  const c = lote.contadores;
  const terminados = c.completados + c.errores;
  const porcentaje = c.total ? (terminados / c.total) * 100 : 0;
  const m = lote.memoria;

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
              aria-valuemax={c.total}
              aria-valuenow={terminados}
              aria-valuetext={`${terminados} de ${c.total}`}
            >
              <div className="man-progress__fill" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className="man-progress__label">
              {terminados.toLocaleString("es-CO")} de {c.total.toLocaleString("es-CO")} ·{" "}
              {porcentaje.toFixed(porcentaje < 10 ? 1 : 0).replace(".", ",")} %
              {c.errores > 0 && (
                <span className="man-progress__label-errors"> · {c.errores.toLocaleString("es-CO")} con error</span>
              )}
              {lote.pausando && " · pausando tras el documento en curso…"}
            </p>
          </div>
        </div>

        <dl className="anz-metricas">
          <div>
            <dt>Velocidad</dt>
            <dd>{lote.porMinuto ? `${lote.porMinuto.toLocaleString("es-CO")} docs/min` : "calculando…"}</dd>
          </div>
          <div>
            <dt>Tiempo restante</dt>
            <dd>{lote.segundosRestantes != null ? formatearDuracion(lote.segundosRestantes) : "calculando…"}</dd>
          </div>
          {m && (
            <div>
              <dt>Memoria libre</dt>
              <dd>
                {formatearMb(m.disponibleMb)} de {formatearMb(m.totalMb)}
                {m.esperando && (
                  <Badge tone="warning" size="sm">
                    esperando memoria
                  </Badge>
                )}
              </dd>
            </div>
          )}
          {m && (
            <div>
              <dt>Análisis por fragmentos de</dt>
              <dd>{m.fragmento.toLocaleString("es-CO")} caracteres</dd>
            </div>
          )}
        </dl>

        <ul className="man-file-list" aria-label="Documentos recientes" aria-live="polite">
          {lote.actual && <Fila evento={lote.actual} />}
          {lote.recientes.map((e) => (
            <Fila key={e.codigo} evento={e} />
          ))}
        </ul>
      </section>

      <div className="anz-acciones">
        <Button
          variant="outlined"
          disabled={lote.pausando}
          iconLeft={
            <span className="material-symbols-outlined" aria-hidden="true">
              {getIconGlyph("pause")}
            </span>
          }
          onClick={onPausar}
        >
          Pausar
        </Button>
      </div>
    </div>
  );
}
