/**
 * Panel lateral del visor: lo ocultado en el documento AGRUPADO por valor
 * ("canula" ×12 es una sola fila), los más repetidos primero: así los falsos
 * positivos frecuentes se corrigen de un toque.
 *
 * Por fila: clic → lleva la primera aparición a la vista; el ojo muestra u
 * oculta todas las apariciones del documento; "Lote" hace lo mismo en todos los
 * documentos del lote; el selector cambia la categoría de todas.
 */
import { useMemo, useState } from "react";
import type { DocumentoRevision, TramoRevision } from "../../api/escritorio";
import { agrupar, type GrupoTramos } from "./segmentos";
import { IconButton } from "../../components/IconButton/IconButton";
import { SearchInput } from "../../components/SearchInput/SearchInput";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { NOMBRES_CATEGORIA } from "../anonimizar/formato";

export interface PanelTramosProps {
  doc: DocumentoRevision;
  onEnfocar: (tramo: TramoRevision) => void;
  onAlternar: (tramo: TramoRevision) => void;
  onCategoria: (grupo: GrupoTramos, categoria: string) => void;
  onLote: (grupo: GrupoTramos) => void;
}

export function PanelTramos({ doc, onEnfocar, onAlternar, onCategoria, onLote }: PanelTramosProps) {
  const [filtro, setFiltro] = useState("");
  const grupos = useMemo(() => agrupar(doc), [doc]);
  const visibles = filtro.trim()
    ? grupos.filter((g) => g.clave.includes(filtro.trim().toLowerCase()))
    : grupos;
  const ocultos = doc.tramos.filter((t) => t.activo).length;

  return (
    <aside className="rev-panel" aria-labelledby="rev-panel-titulo">
      <h2 id="rev-panel-titulo" className="rev-panel__titulo">
        Datos ocultados <span className="rev-panel__cuenta">{ocultos}</span>
      </h2>
      <p className="anz-nota">
        {grupos.length} {grupos.length === 1 ? "valor distinto" : "valores distintos"} · los más repetidos primero
      </p>
      {grupos.length > 8 && (
        <SearchInput label="Buscar en lo ocultado" placeholder="Buscar" value={filtro} onChange={setFiltro} />
      )}
      {grupos.length === 0 ? (
        <p className="anz-nota">No se ocultó nada en este documento. Selecciona texto en el visor para ocultarlo.</p>
      ) : (
        <ul className="rev-panel__lista">
          {visibles.map((g) => {
            const activo = g.activos > 0;
            return (
              <li key={g.clave} className={"rev-panel__item" + (activo ? "" : " rev-panel__item--revertido")}>
                <div className="rev-panel__cuerpo">
                  <button type="button" className="rev-panel__boton" onClick={() => onEnfocar(g.tramos[0]!)}>
                    <span className={`rev-punto rev-tramo--${g.categoria}`} aria-hidden="true" />
                    <span className="rev-panel__texto" title={g.texto}>
                      {g.texto}
                    </span>
                    {g.tramos.length > 1 && <span className="rev-panel__veces">×{g.tramos.length}</span>}
                  </button>
                  <span className="rev-panel__meta">
                    <select
                      className="rev-select rev-select--mini"
                      aria-label={`Categoría de ${g.texto}`}
                      value={g.categoria}
                      onChange={(e) => onCategoria(g, e.target.value)}
                    >
                      {Object.entries(NOMBRES_CATEGORIA).map(([valor, nombre]) => (
                        <option key={valor} value={valor}>
                          {nombre}
                        </option>
                      ))}
                    </select>
                    {!activo && <span>visible</span>}
                    {g.manual && (
                      <span className="rev-panel__manual">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {getIconGlyph("edit_note")}
                        </span>
                        manual
                      </span>
                    )}
                  </span>
                </div>
                <IconButton
                  icon={activo ? "visibility" : "visibility_off"}
                  label={activo ? `Mostrar “${g.texto}” en este documento` : `Ocultar “${g.texto}” en este documento`}
                  size="sm"
                  onClick={() => onAlternar(g.tramos[0]!)}
                />
                <button
                  type="button"
                  className="rev-panel__lote"
                  title={activo ? `Mostrar “${g.texto}” en todo el lote` : `Ocultar “${g.texto}” en todo el lote`}
                  onClick={() => onLote(g)}
                >
                  Lote
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
