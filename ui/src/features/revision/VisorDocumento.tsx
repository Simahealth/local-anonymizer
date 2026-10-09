/**
 * Visor de revisión tipo lector PDF: el documento por páginas sobre un fondo
 * gris, con zoom, en dos modos:
 *
 *   Revisión  -- texto ORIGINAL con lo ocultado resaltado por categoría. Es el
 *                modo para corregir: se ve qué se va a ocultar y qué no.
 *   Resultado -- como queda el PDF anonimizado ([NOMBRE], [DOCUMENTO]…).
 *
 * En ambos modos:
 *   - seleccionar texto → barra flotante "Ocultar como <categoría>", en ese
 *     punto o en todas sus apariciones del documento;
 *   - clic en algo ocultado → popover con el texto original, la categoría
 *     (editable) y "Mostrar" (revertir: no era un dato personal);
 *   - lo revertido queda subrayado y se puede volver a ocultar.
 * Cada cambio se guarda al instante y regenera el PDF anonimizado.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DocumentoRevision, TramoRevision } from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import { SelectionGroup } from "../../components/SelectionGroup/SelectionGroup";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { ETIQUETAS, NOMBRES_CATEGORIA } from "../anonimizar/formato";
import { paginar, rangoDeSeleccion } from "./segmentos";

export type ModoVisor = "revision" | "resultado";

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
const CLAVE_CATEGORIA = "sima.revision.categoria";

function leerCategoria(): string {
  try {
    return localStorage.getItem(CLAVE_CATEGORIA) ?? "nombres";
  } catch {
    return "nombres";
  }
}

export interface VisorDocumentoProps {
  doc: DocumentoRevision;
  modo: ModoVisor;
  onModo: (modo: ModoVisor) => void;
  ocupado: boolean;
  /** Tramo a resaltar y llevar a la vista (desde el panel lateral). */
  enfoque: { id: number; n: number } | null;
  onOcultar: (inicio: number, fin: number, categoria: string, todas: boolean) => void;
  onActualizarTramo: (tramo: TramoRevision, cambios: { activo?: boolean; categoria?: string }) => void;
}

interface Flotante {
  x: number;
  y: number;
}

export function VisorDocumento({
  doc,
  modo,
  onModo,
  ocupado,
  enfoque,
  onOcultar,
  onActualizarTramo,
}: VisorDocumentoProps) {
  const [zoom, setZoom] = useState(1);
  const [seleccion, setSeleccion] = useState<({ inicio: number; fin: number } & Flotante) | null>(null);
  const [categoria, setCategoria] = useState(leerCategoria);
  const [todas, setTodas] = useState(true);
  const [popover, setPopover] = useState<({ tramoId: number } & Flotante) | null>(null);
  const paginasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const paginas = useMemo(() => paginar(doc.texto, doc.tramos), [doc.texto, doc.tramos]);
  const tramoPopover = popover ? doc.tramos.find((t) => t.id === popover.tramoId) : undefined;

  const cerrarFlotantes = useCallback(() => {
    setSeleccion(null);
    setPopover(null);
  }, []);

  // Documento nuevo: sin flotantes (ajuste durante el render) y arriba del todo.
  const [codigoPrevio, setCodigoPrevio] = useState(doc.codigo);
  if (codigoPrevio !== doc.codigo) {
    setCodigoPrevio(doc.codigo);
    setSeleccion(null);
    setPopover(null);
  }
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [doc.codigo]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrarFlotantes();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cerrarFlotantes]);

  // Llevar a la vista el tramo elegido en el panel lateral.
  useEffect(() => {
    if (!enfoque) return;
    const el = paginasRef.current?.querySelector<HTMLElement>(`[data-tramo="${enfoque.id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("rev-tramo--destello");
    void el.offsetWidth; // reinicia la animación
    el.classList.add("rev-tramo--destello");
  }, [enfoque]);

  function alSoltarMouse() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !paginasRef.current) return;
    const rango = sel.getRangeAt(0);
    const r = rangoDeSeleccion(rango, paginasRef.current);
    if (!r) {
      setSeleccion(null);
      return;
    }
    const caja = rango.getBoundingClientRect();
    setPopover(null);
    setSeleccion({ ...r, x: caja.left + caja.width / 2, y: caja.bottom + 8 });
  }

  function confirmarOcultar() {
    if (!seleccion) return;
    try {
      localStorage.setItem(CLAVE_CATEGORIA, categoria);
    } catch {
      /* preferencia opcional */
    }
    onOcultar(seleccion.inicio, seleccion.fin, categoria, todas);
    window.getSelection()?.removeAllRanges();
    setSeleccion(null);
  }

  function alClicTramo(e: React.MouseEvent, t: TramoRevision) {
    if (!window.getSelection()?.isCollapsed) return; // está seleccionando, no haciendo clic
    const caja = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSeleccion(null);
    setPopover({ tramoId: t.id, x: caja.left + caja.width / 2, y: caja.bottom + 8 });
  }

  const nPaginas = paginas.length;

  return (
    <div className="rev-visor">
      <div className="rev-visor__barra" role="toolbar" aria-label="Herramientas del visor">
        <SelectionGroup
          label="Modo de vista"
          sgKey="modo-visor"
          hideLabel
          items={[
            { value: "revision", label: "Revisión", active: modo === "revision" },
            { value: "resultado", label: "Resultado", active: modo === "resultado" },
          ]}
          onChange={(v) => onModo(v as ModoVisor)}
        />
        <span className="rev-visor__info">
          {nPaginas} {nPaginas === 1 ? "página" : "páginas"}
        </span>
        <div className="rev-visor__zoom">
          <IconButton
            icon="zoom_out"
            label="Alejar"
            size="sm"
            disabled={zoom <= ZOOMS[0]!}
            onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]!)}
          />
          <span className="rev-visor__zoom-valor">{Math.round(zoom * 100)} %</span>
          <IconButton
            icon="zoom_in"
            label="Acercar"
            size="sm"
            disabled={zoom >= ZOOMS[ZOOMS.length - 1]!}
            onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]!)}
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="rev-visor__lienzo"
        onScroll={cerrarFlotantes}
        aria-busy={ocupado || undefined}
      >
        <div
          ref={paginasRef}
          className={`rev-paginas rev-paginas--${modo}`}
          style={{ "--rev-zoom": zoom } as React.CSSProperties}
          onMouseUp={alSoltarMouse}
        >
          {paginas.map((p) => (
            <article key={p.numero} className="rev-pagina" aria-label={`Página ${p.numero} de ${nPaginas}`}>
              <div className="rev-pagina__texto">
                {p.segmentos.map((s) => {
                  const t = s.tramo;
                  if (!t) {
                    return (
                      <span key={s.ini} data-ini={s.ini} data-fin={s.fin}>
                        {doc.texto.slice(s.ini, s.fin)}
                      </span>
                    );
                  }
                  const original = doc.texto.slice(s.ini, s.fin);
                  const mostrarEtiqueta = modo === "resultado" && t.activo;
                  return (
                    <mark
                      key={s.ini}
                      data-ini={s.ini}
                      data-fin={s.fin}
                      data-tramo={t.id}
                      className={
                        `rev-tramo rev-tramo--${t.categoria}` +
                        (t.activo ? "" : " rev-tramo--revertido") +
                        (t.origen === "manual" ? " rev-tramo--manual" : "")
                      }
                      title={`${NOMBRES_CATEGORIA[t.categoria] ?? t.categoria}${t.activo ? "" : " (visible)"}`}
                      onClick={(e) => alClicTramo(e, t)}
                    >
                      {mostrarEtiqueta ? ETIQUETAS[t.categoria] ?? "[OCULTO]" : original}
                    </mark>
                  );
                })}
              </div>
              <footer className="rev-pagina__pie">
                {p.numero} / {nPaginas}
              </footer>
            </article>
          ))}
        </div>
      </div>

      {seleccion && (
        <div
          className="rev-flotante"
          style={{ left: seleccion.x, top: seleccion.y }}
          role="dialog"
          aria-label="Ocultar selección"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="rev-flotante__cita">“{doc.texto.slice(seleccion.inicio, seleccion.fin).trim().slice(0, 80)}”</p>
          <label className="rev-flotante__campo">
            <span>Ocultar como</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="rev-select">
              {Object.entries(NOMBRES_CATEGORIA).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="rev-flotante__check">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
            En todo el documento
          </label>
          <div className="rev-flotante__acciones">
            <Button variant="ghost" size="sm" onClick={cerrarFlotantes}>
              Cancelar
            </Button>
            <Button
              size="sm"
              iconLeft={
                <span className="material-symbols-outlined" aria-hidden="true">
                  {getIconGlyph("visibility_off")}
                </span>
              }
              onClick={confirmarOcultar}
            >
              Ocultar
            </Button>
          </div>
        </div>
      )}

      {popover && tramoPopover && (
        <div
          className="rev-flotante"
          style={{ left: popover.x, top: popover.y }}
          role="dialog"
          aria-label="Dato ocultado"
        >
          <p className="rev-flotante__titulo">
            {tramoPopover.activo ? "Dato ocultado" : "Dato visible (revertido)"}
            <span className="rev-flotante__origen">
              {tramoPopover.origen === "manual" ? "agregado en revisión" : "detectado automáticamente"}
            </span>
          </p>
          <p className="rev-flotante__cita">“{doc.texto.slice(tramoPopover.inicio, tramoPopover.fin)}”</p>
          <label className="rev-flotante__campo">
            <span>Categoría</span>
            <select
              className="rev-select"
              value={tramoPopover.categoria}
              onChange={(e) => onActualizarTramo(tramoPopover, { categoria: e.target.value })}
            >
              {Object.entries(NOMBRES_CATEGORIA).map(([valor, nombre]) => (
                <option key={valor} value={valor}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="rev-flotante__acciones">
            <Button variant="ghost" size="sm" onClick={() => setPopover(null)}>
              Cerrar
            </Button>
            {tramoPopover.activo ? (
              <Button
                variant="outlined"
                size="sm"
                iconLeft={
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {getIconGlyph("visibility")}
                  </span>
                }
                onClick={() => {
                  onActualizarTramo(tramoPopover, { activo: false });
                  setPopover(null);
                }}
              >
                Mostrar (no es dato personal)
              </Button>
            ) : (
              <Button
                size="sm"
                iconLeft={
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {getIconGlyph("visibility_off")}
                  </span>
                }
                onClick={() => {
                  onActualizarTramo(tramoPopover, { activo: true });
                  setPopover(null);
                }}
              >
                Volver a ocultar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
