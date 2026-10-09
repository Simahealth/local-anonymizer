/**
 * Tooltip — DS molecule. Anotación flotante corta, revelada en hover/focus
 * del trigger que envuelve. Ver `src/styles/ds/molecules/tooltip/
 * tooltip.css` para el patrón visual completo y el porqué de cada token.
 *
 * Envuelve un único elemento (`children`) vía `cloneElement`, sin imponer
 * qué tipo de elemento es -- funciona igual sobre un `IconButton`, un
 * `<button>` a mano, o un `<div role="button">` como `DocumentTrigger`.
 * Compone los handlers `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`
 * que el trigger ya tuviera en vez de reemplazarlos.
 *
 * Posicionamiento (portal + measure, no CSS puro): la capa flotante se
 * renderiza vía `createPortal` en `document.body` -- nunca como hijo
 * relativo del trigger -- así escapa de cualquier ancestro con
 * `overflow: hidden` (una card, un panel, el catálogo DS) en vez de
 * cortarse contra su borde. Al hacerse visible mide el `trigger`
 * (`wrapperRef`) y el propio tooltip (`tooltipRef`) con
 * `getBoundingClientRect()` y calcula una posición `position: fixed`
 * (`top`/`left` en coordenadas de viewport):
 *   - vertical: arriba del trigger si entra en el viewport, si no, abajo;
 *   - horizontal: centrado por defecto (`align="center"`), o pegado al
 *     borde izquierdo/derecho del trigger (`align="start"`/`"end"`);
 *   - en los tres casos, el resultado se clampea contra los bordes del
 *     viewport (margen mínimo `VIEWPORT_MARGIN`) -- el clamp SIEMPRE
 *     gana sobre `align`, es la garantía anti-corte, no una sugerencia.
 * Se recalcula en `resize`/`scroll` (captura, para scrolls de
 * contenedores internos) mientras el tooltip está visible.
 *
 * Accesibilidad: el nodo `role="tooltip"` vive siempre en el DOM (nunca
 * se monta/desmonta condicionalmente) con un `id` estable (`useId`), y
 * el trigger lleva `aria-describedby` apuntando a ese id sin importar
 * el estado visual -- así un lector de pantalla lo anuncia en foco
 * incluso si la transición de opacidad todavía no terminó. La
 * visibilidad real (para usuarios videntes) la resuelve el CSS
 * (`.tooltip--visible`), nunca `display`/`visibility` inline. Vivir en
 * un portal no cambia nada de esto -- `aria-describedby` referencia un
 * `id`, no una posición en el árbol DOM.
 */
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  /** Contenido corto del tooltip (texto plano o nodos simples). */
  content: React.ReactNode;
  /** Único hijo -- el elemento que dispara el tooltip en hover/focus. */
  children: ReactElement;
  /**
   * Alineación horizontal preferida respecto al trigger. Default:
   * centrado. Es solo una preferencia -- el clamp contra los bordes del
   * viewport (ver el docstring de arriba) puede desplazarla si no
   * entra tal cual, así que ya no depende de elegir bien el valor
   * según el contexto para evitar un corte: eso lo resuelve el cálculo
   * de posición en tiempo real.
   */
  align?: "center" | "start" | "end";
  className?: string;
}

// Mirrors `--space-8` -- el gap entre trigger y tooltip que este
// componente ya usaba en CSS antes de mover el posicionamiento a JS.
const GAP = 8;
// Mirrors `--space-12` -- margen mínimo contra el borde del viewport,
// para que el tooltip nunca quede pegado al chrome del navegador.
const VIEWPORT_MARGIN = 12;

interface TooltipPosition {
  top: number;
  left: number;
}

export function Tooltip({ content, children, align = "center", className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  function reposition() {
    const triggerEl = wrapperRef.current;
    const tooltipEl = tooltipRef.current;
    if (!triggerEl || !tooltipEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let left =
      align === "start"
        ? triggerRect.left
        : align === "end"
          ? triggerRect.right - tooltipRect.width
          : triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);

    const spaceAbove = triggerRect.top - GAP - VIEWPORT_MARGIN;
    const fitsAbove = spaceAbove >= tooltipRect.height;
    const top = fitsAbove ? triggerRect.top - tooltipRect.height - GAP : triggerRect.bottom + GAP;

    setPosition({ top, left });
  }

  const repositionRef = useRef(reposition);
  repositionRef.current = reposition;

  useLayoutEffect(() => {
    if (!visible) return;
    repositionRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, content, align]);

  useEffect(() => {
    if (!visible) return;
    const handler = () => repositionRef.current();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [visible]);

  if (!isValidElement(children)) return children;

  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  const trigger = cloneElement(child, {
    "aria-describedby": tooltipId,
    onMouseEnter: (e: React.MouseEvent) => {
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      setVisible(true);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      setVisible(false);
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      setVisible(true);
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      setVisible(false);
    },
  });

  const tooltipNode = (
    <span
      role="tooltip"
      id={tooltipId}
      ref={tooltipRef}
      className={"tooltip" + (visible ? " tooltip--visible" : "")}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      {content}
    </span>
  );

  return (
    <span ref={wrapperRef} className={`tooltip-wrapper${className ? ` ${className}` : ""}`}>
      {trigger}
      {createPortal(tooltipNode, document.body)}
    </span>
  );
}
