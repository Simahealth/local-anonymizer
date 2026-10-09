/**
 * Lista de documentos del lote, paginada en Python (un lote puede tener 50 000):
 * búsqueda por código o nombre original y filtros por estado de revisión.
 */
import type { FiltroDocumentos, ResumenDocumento } from "../../api/escritorio";
import { IconButton } from "../../components/IconButton/IconButton";
import { SearchInput } from "../../components/SearchInput/SearchInput";
import { SelectionGroup } from "../../components/SelectionGroup/SelectionGroup";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";

export const POR_PAGINA = 100;

const FILTROS: { value: FiltroDocumentos; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "sin_revisar", label: "Sin revisar" },
  { value: "revisados", label: "Revisados" },
  { value: "errores", label: "Errores" },
];

export interface ListaDocumentosProps {
  documentos: ResumenDocumento[];
  total: number;
  offset: number;
  filtro: FiltroDocumentos;
  busqueda: string;
  seleccionado: string | null;
  cargando: boolean;
  onFiltro: (f: FiltroDocumentos) => void;
  onBusqueda: (q: string) => void;
  onPagina: (offset: number) => void;
  onElegir: (codigo: string) => void;
  onRecargar: () => void;
}

function iconoDe(d: ResumenDocumento): { icono: IconName; clase: string } {
  if (d.estado === "error") return { icono: "error", clase: "rev-doc__icono--error" };
  if (d.estado !== "completado") return { icono: "hourglass_top", clase: "" };
  if (d.revisado) return { icono: "check_circle", clase: "rev-doc__icono--ok" };
  return { icono: "description", clase: "" };
}

export function ListaDocumentos({
  documentos,
  total,
  offset,
  filtro,
  busqueda,
  seleccionado,
  cargando,
  onFiltro,
  onBusqueda,
  onPagina,
  onElegir,
  onRecargar,
}: ListaDocumentosProps) {
  const hasta = Math.min(offset + POR_PAGINA, total);

  return (
    <nav className="rev-lista" aria-label="Documentos del lote">
      <div className="rev-lista__cabecera">
        <SearchInput
          label="Buscar por código o nombre de archivo"
          placeholder="Código o nombre de archivo"
          value={busqueda}
          onChange={onBusqueda}
          className="rev-lista__buscar"
        />
        <IconButton icon="refresh" label="Actualizar lista" size="sm" onClick={onRecargar} />
      </div>
      <SelectionGroup
        label="Filtrar documentos"
        sgKey="filtro-docs"
        hideLabel
        items={FILTROS.map((f) => ({ ...f, active: f.value === filtro }))}
        onChange={(v) => onFiltro(v as FiltroDocumentos)}
      />

      <ul className="rev-lista__items" aria-busy={cargando || undefined}>
        {documentos.length === 0 && !cargando && <li className="anz-nota rev-lista__vacio">No hay documentos.</li>}
        {documentos.map((d) => {
          const { icono, clase } = iconoDe(d);
          return (
            <li key={d.codigo}>
              <button
                type="button"
                className={"rev-doc" + (d.codigo === seleccionado ? " rev-doc--activo" : "")}
                aria-current={d.codigo === seleccionado || undefined}
                onClick={() => onElegir(d.codigo)}
              >
                <span className={`material-symbols-outlined rev-doc__icono ${clase}`} aria-hidden="true">
                  {getIconGlyph(icono)}
                </span>
                <span className="rev-doc__cuerpo">
                  <span className="rev-doc__nombre" title={d.nombreOriginal}>
                    {d.nombreOriginal}
                  </span>
                  <span className="rev-doc__meta">
                    <span className="anz-codigo">{d.codigo}</span>
                    {d.estado === "completado" && ` · ${d.totalPii} ocultos`}
                    {d.estado === "error" && " · error"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rev-lista__paginacion">
        <IconButton
          icon="chevron_left"
          label="Página anterior"
          size="sm"
          disabled={offset === 0}
          onClick={() => onPagina(Math.max(0, offset - POR_PAGINA))}
        />
        <span className="anz-nota">
          {total === 0
            ? "0"
            : `${(offset + 1).toLocaleString("es-CO")}–${hasta.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")}`}
        </span>
        <IconButton
          icon="chevron_right"
          label="Página siguiente"
          size="sm"
          disabled={hasta >= total}
          onClick={() => onPagina(offset + POR_PAGINA)}
        />
      </div>
    </nav>
  );
}
