/**
 * Panel lateral del visor: todo lo ocultado en el documento, en orden de
 * aparición, con su texto original. Clic → lo lleva a la vista en el visor;
 * el botón del ojo lo revierte (lo deja visible) o lo vuelve a ocultar.
 */
import type { DocumentoRevision, TramoRevision } from "../../api/escritorio";
import { IconButton } from "../../components/IconButton/IconButton";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { NOMBRES_CATEGORIA } from "../anonimizar/formato";

export interface PanelTramosProps {
  doc: DocumentoRevision;
  onEnfocar: (tramo: TramoRevision) => void;
  onAlternar: (tramo: TramoRevision) => void;
}

export function PanelTramos({ doc, onEnfocar, onAlternar }: PanelTramosProps) {
  const activos = doc.tramos.filter((t) => t.activo).length;
  const revertidos = doc.tramos.length - activos;

  return (
    <aside className="rev-panel" aria-labelledby="rev-panel-titulo">
      <h2 id="rev-panel-titulo" className="rev-panel__titulo">
        Datos ocultados <span className="rev-panel__cuenta">{activos}</span>
      </h2>
      {revertidos > 0 && <p className="anz-nota">{revertidos} visibles (revertidos)</p>}
      {doc.tramos.length === 0 ? (
        <p className="anz-nota">
          No se ocultó nada en este documento. Selecciona texto en el visor para ocultarlo.
        </p>
      ) : (
        <ul className="rev-panel__lista">
          {doc.tramos.map((t) => (
            <li key={t.id} className={"rev-panel__item" + (t.activo ? "" : " rev-panel__item--revertido")}>
              <button type="button" className="rev-panel__boton" onClick={() => onEnfocar(t)}>
                <span className={`rev-punto rev-tramo--${t.categoria}`} aria-hidden="true" />
                <span className="rev-panel__cuerpo">
                  <span className="rev-panel__texto">{doc.texto.slice(t.inicio, t.fin).replace(/\s+/g, " ")}</span>
                  <span className="rev-panel__meta">
                    {NOMBRES_CATEGORIA[t.categoria] ?? t.categoria}
                    {t.origen === "manual" && (
                      <span className="rev-panel__manual">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {getIconGlyph("edit_note")}
                        </span>
                        manual
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <IconButton
                icon={t.activo ? "visibility" : "visibility_off"}
                label={t.activo ? "Mostrar (no es dato personal)" : "Volver a ocultar"}
                size="sm"
                onClick={() => onAlternar(t)}
              />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
