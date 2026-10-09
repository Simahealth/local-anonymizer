/**
 * Visor de revisión tipo lector PDF: el documento por páginas sobre un fondo
 * gris, con zoom, en dos modos:
 *
 *   Revisión  -- texto ORIGINAL con lo ocultado resaltado por categoría.
 *   Resultado -- como queda el PDF anonimizado ([NOMBRE], [DOCUMENTO]…).
 *
 * Dos gestos, nada más:
 *   - TOCAR algo resaltado lo muestra (no era dato personal), junto con todas
 *     sus apariciones iguales en el documento; tocarlo otra vez lo oculta.
 *   - SELECCIONAR texto (arrastrar o doble clic sobre una palabra) abre una
 *     barra con "Ocultar": la categoría viene sugerida y Enter confirma.
 * Cada cambio se guarda al instante y regenera el PDF anonimizado.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DocumentoRevision, TramoRevision } from "../../api/escritorio";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import { SelectionGroup } from "../../components/SelectionGroup/SelectionGroup";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";
import { ETIQUETAS, NOMBRES_CATEGORIA } from "../anonimizar/formato";
import { paginar, rangoDeSeleccion, sugerirCategoria } from "./segmentos";

export type ModoVisor = "revision" | "resultado";

const ZOOMS = [0.75, 0.9, 1, 1.15, 1.3, 1.5];

export interface VisorDocumentoProps {
  doc: DocumentoRevision;
  modo: ModoVisor;
  onModo: (modo: ModoVisor) => void;
  ocupado: boolean;
  /** Tramo a resaltar y llevar a la vista (desde el panel lateral). */
  enfoque: { id: number; n: number } | null;
  /** Tocar un tramo: mostrarlo/ocultarlo con todas sus apariciones iguales. */
  onAlternar: (tramo: TramoRevision) => void;
  onOcultar: (inicio: number, fin: number, categoria: string, alcance: "documento" | "lote") => void;
}

export function VisorDocumento({ doc, modo, onModo, ocupado, enfoque, onAlternar, onOcultar }: VisorDocumentoProps) {
  const [zoom, setZoom] = useState(1);
  const [seleccion, setSeleccion] = useState<{ inicio: number; fin: number; x: number; y: number } | null>(null);
  const [categoria, setCategoria] = useState("nombres");
  const paginasRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);

  const paginas = useMemo(() => paginar(doc.texto, doc.tramos), [doc.texto, doc.tramos]);

  const cerrar = useCallback(() => setSeleccion(null), []);

  // Documento nuevo: sin barra (ajuste durante el render) y arriba del todo.
  const [codigoPrevio, setCodigoPrevio] = useState(doc.codigo);
  if (codigoPrevio !== doc.codigo) {
    setCodigoPrevio(doc.codigo);
    setSeleccion(null);
  }
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [doc.codigo]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cerrar]);

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

  // El botón "Ocultar" recibe el foco: Enter confirma sin tocar el mouse.
  useEffect(() => {
    if (seleccion) barraRef.current?.querySelector<HTMLButtonElement>(".btn--primary")?.focus({ preventScroll: true });
  }, [seleccion]);

  function alSoltarMouse() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !paginasRef.current) return;
    const rango = sel.getRangeAt(0);
    const r = rangoDeSeleccion(rango, paginasRef.current);
    if (!r || !doc.texto.slice(r.inicio, r.fin).trim()) {
      setSeleccion(null);
      return;
    }
    const caja = rango.getBoundingClientRect();
    setCategoria(sugerirCategoria(doc.texto.slice(r.inicio, r.fin)));
    setSeleccion({ ...r, x: caja.left + caja.width / 2, y: caja.bottom + 8 });
  }

  function confirmar(alcance: "documento" | "lote") {
    if (!seleccion) return;
    onOcultar(seleccion.inicio, seleccion.fin, categoria, alcance);
    window.getSelection()?.removeAllRanges();
    setSeleccion(null);
  }

  function alTocarTramo(t: TramoRevision) {
    if (!window.getSelection()?.isCollapsed) return; // está seleccionando, no tocando
    setSeleccion(null);
    onAlternar(t);
  }

  const nPaginas = paginas.length;
  const cita = seleccion ? doc.texto.slice(seleccion.inicio, seleccion.fin).replace(/\s+/g, " ").trim() : "";

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
        <span className="rev-visor__ayuda">
          <span className="material-symbols-outlined" aria-hidden="true">
            {getIconGlyph("info")}
          </span>
          Toca para mostrar · selecciona para ocultar
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

      <div ref={scrollRef} className="rev-visor__lienzo" onScroll={cerrar} aria-busy={ocupado || undefined}>
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
                  const nombreCat = NOMBRES_CATEGORIA[t.categoria] ?? t.categoria;
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
                      title={t.activo ? `${nombreCat} · toca para mostrar` : "Visible · toca para volver a ocultar"}
                      onClick={() => alTocarTramo(t)}
                    >
                      {modo === "resultado" && t.activo
                        ? ETIQUETAS[t.categoria] ?? "[OCULTO]"
                        : doc.texto.slice(s.ini, s.fin)}
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
          ref={barraRef}
          className="rev-flotante rev-flotante--barra"
          style={{ left: seleccion.x, top: seleccion.y }}
          role="dialog"
          aria-label="Ocultar selección"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className="rev-flotante__cita" title={cita}>
            “{cita.length > 40 ? cita.slice(0, 40) + "…" : cita}”
          </span>
          <select
            aria-label="Ocultar como"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rev-select"
          >
            {Object.entries(NOMBRES_CATEGORIA).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            iconLeft={
              <span className="material-symbols-outlined" aria-hidden="true">
                {getIconGlyph("visibility_off")}
              </span>
            }
            onClick={() => confirmar("documento")}
          >
            Ocultar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => confirmar("lote")}>
            En todo el lote
          </Button>
        </div>
      )}
    </div>
  );
}
