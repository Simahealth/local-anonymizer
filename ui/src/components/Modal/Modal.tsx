/**
 * DS organism: Modal. Centered, reusable modal chrome -- backdrop,
 * container, header (title + close), scrollable body. Knows nothing about
 * any consumer's content (no Nuevo Caso / HC / Case concepts here).
 *
 * Small API (open/title/onClose/children), plus an optional `footer` slot
 * (added when the Nuevo Caso flow needed a persistent milestone bar pinned
 * to the bottom, visible across that flow's screens) -- `footer` is pure
 * chrome positioning, same as `children`: Modal renders whatever node it's
 * given and knows nothing about what's inside it (no milestones/Case/HC
 * concepts here).
 *
 * `width` (added 2026-08-19, the first real need for a size prop, revised
 * the same day 50vw -> 70vw): optional, defaults to the original single
 * fixed-width container ("default", 560px, unchanged for every existing
 * consumer) -- "wide" is an opt-in modifier (`.modal-container--wide`,
 * ~70vw) for the ONE screen that needs shorter text lines (Nuevo Caso's
 * Resumen Final). No consumer that omits `width` is affected.
 *
 * Focus (2026-09-08, migrado a `useFocusTrap`, la primitiva DS
 * compartida -- ver `src/components/FocusTrap/`): sigue enfocando el
 * contenedor mismo al abrir (`initialFocusRef={containerRef}`, mismo
 * comportamiento exacto de antes -- decisión ya tomada, no un
 * descubrimiento de este hook, se preserva a propósito). Lo que SÍ es
 * nuevo: Tab/Shift+Tab ahora ciclan dentro del modal (antes no había
 * ningún trap de Tab en absoluto) y el foco se restaura solo al trigger
 * que abrió el modal al cerrar (antes, cerrar cualquier consumidor de
 * `Modal` perdía el foco a `<body>` -- ninguno de los 4 consumidores
 * reales de `Modal` implementaba su propio restore; el único que sí
 * restaura foco hoy, `DetailPanel` via `App.tsx`'s `lastFocusRef`, no usa
 * `Modal` en absoluto, es un overlay completamente aparte). ninguno de
 * los dos cambios altera markup/clases/roles.
 *
 * Backdrop click closes (matches the convention App.tsx already uses for
 * every existing overlay -- DetailPanel's and the previous
 * CreateCaseForm's backdrops both close on click). onClose is purely
 * "user asked to close" -- it never touches business state; that's the
 * consumer's job.
 *
 * `escapeDisabled` (added for the Z1 drilldown modal, which can have
 * DetailPanel open on top of it): DetailPanel has its own independent
 * Escape listener, so with both open a single Escape keypress would
 * otherwise fire both onClose handlers and close this Modal too --
 * defeating "closing DetailPanel returns you to the modal exactly as it
 * was". Backdrop-click doesn't have this problem (the topmost overlay's
 * opaque backdrop already intercepts the click physically), only the
 * global keydown listener does. Default false/omitted: every existing
 * consumer (ModalNuevoCaso included) is unaffected. Unchanged by esta
 * migración -- pasa directo a `useFocusTrap`'s propio `escapeDisabled`.
 *
 * 2026-09-09 (ClinicalNoteModal, `DetailPanel`'s reemplazo de
 * `window.prompt()`): 3 props nuevas, las 3 opcionales y sin efecto por
 * default -- ningún consumidor existente (`ModalNuevoCaso`,
 * `ModalResumenFinal`, `Z1DrilldownModal`, `NoteComposer`) cambia de
 * comportamiento.
 *   - `initialFocusRef`: a qué foco inicial, en vez de siempre el
 *     contenedor mismo. Un modal de formulario (nota clínica) quiere el
 *     foco directo en el campo, no en el chrome -- se lo pasa derecho a
 *     `useFocusTrap`, que ya sabía hacer esto (ver
 *     `src/components/FocusTrap/`), Modal solo no lo exponía.
 *   - `describedById`: conecta `aria-describedby` del `role="dialog"` a
 *     una descripción/error que vive DENTRO de `children` (Modal no
 *     controla ese contenido, así que no puede generar el id él mismo --
 *     el consumidor lo genera con su propio `useId()` y se lo pasa).
 *   - `closeDisabled`: bloquea las 3 vías de cierre que Modal controla
 *     (Escape, click en backdrop, botón "Cerrar" -- deshabilitado, no
 *     oculto, para no mover el layout del header) mientras una acción
 *     async está en curso ("Cancelar" es un botón del propio `footer`
 *     del consumidor, no de Modal -- ese lo deshabilita el consumidor).
 *     Distinto de `escapeDisabled` (que es sobre apilamiento de
 *     overlays, no sobre estar ocupado) -- se combinan, no se
 *     reemplazan.
 */
import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../IconButton/IconButton";
import { useFocusTrap } from "../FocusTrap/useFocusTrap";
import "../../styles/ds/organisms/Modal/modal.css";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional chrome slot pinned to the bottom of the Modal, below the
   * scrollable body -- stays visible regardless of what `children` is.
   * Generic; Modal doesn't interpret what's rendered inside it. */
  footer?: React.ReactNode;
  /** "default" (omit) keeps every existing consumer's exact 560px width.
   * "wide" is the one opt-in modifier so far, ~70vw, for Resumen Final. */
  width?: "default" | "wide";
  /** True while another overlay is stacked on top of this one and owns
   * Escape itself (see docblock above). Omit/false for every normal use. */
  escapeDisabled?: boolean;
  /** Default: el contenedor mismo (comportamiento histórico, sin
   * cambios). Pasalo cuando el contenido tiene un control que debería
   * recibir el foco directamente al abrir (p. ej. el `Textarea` de un
   * prompt). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Default: sin `aria-describedby`. El id de un elemento dentro de
   * `children` (descripción, error) que describe el propósito del
   * modal -- generalo con `useId()` en el consumidor. */
  describedById?: string;
  /** Default: false. Bloquea Escape/backdrop/botón "Cerrar" mientras es
   * true -- para una acción async en curso que no debe interrumpirse a
   * mitad de camino. El botón "Cerrar" queda `disabled` (visible, no
   * oculto) en vez de removido, para no mover el layout del header. */
  closeDisabled?: boolean;
  /** chat 2026-09-27: clase extra en el `.modal-overlay` portaleado
   * (nunca en un wrapper alrededor de `<Modal>`: como se porta directo a
   * `document.body`, ese wrapper nunca termina siendo su ancestro real
   * en el DOM -- un selector `.wrapper .modal-overlay` no matchea nunca,
   * confirmado con `Z1DrilldownModal`'s propio z-index override, que
   * llevaba tiempo sin aplicarse). Único mecanismo real para que un
   * consumidor le pise algo (ej. `z-index`) a ESTA instancia sin afectar
   * a las demás. */
  overlayClassName?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "default",
  escapeDisabled = false,
  initialFocusRef,
  describedById,
  closeDisabled = false,
  overlayClassName,
}: ModalProps) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // DetailPanel QA visual fixes task: this `Modal`'s own `.modal-overlay`
  // is ALWAYS mounted/portaled (even while `open` is false -- needed for
  // the opacity-close transition below), so with more than one `Modal`
  // in the tree at once (e.g. UserSettingsModal's own sign-out
  // confirmation, itself a `Modal` nested in its JSX/children), the DOM
  // order two portals land in inside `document.body` is React's commit
  // order for the FIRST mount -- NOT "whichever opened most recently".
  // Re-appending this node to `document.body` every time it opens moves
  // it (appendChild on a node already in the DOM relocates it) to the
  // END of body's children, so the most recently opened modal is always
  // last in DOM order -- same rule `--z-overlay`'s equal value across
  // every Modal already relies on for paint order, and the same
  // "last in DOM = the one currently relevant" assumption existing
  // tests across the app (and this modal's own consumers) already make
  // when more than one dialog can be open together.
  useEffect(() => {
    if (open && overlayRef.current) {
      document.body.appendChild(overlayRef.current);
    }
  }, [open]);

  useFocusTrap({
    containerRef,
    active: open,
    initialFocusRef: initialFocusRef ?? containerRef,
    onEscape: onClose,
    escapeDisabled: escapeDisabled || closeDisabled,
  });

  // DetailPanel QA visual fixes task: portaled to `document.body` instead
  // of rendering in place. Root cause of the "modal centers on the panel,
  // not the viewport" bug -- `.panel-overlay` (DetailPanel's own slide-in
  // drawer, detail-panel.css) sets `transform: translateX(...)` even
  // while open (`translateX(0)`, not `none`), and ANY non-`none`
  // `transform` on an ancestor creates a new containing block for its
  // `position: fixed` descendants (CSS spec, not a bug in this Modal) --
  // so a Modal opened from inside the panel was "fixed" to the panel's
  // own box, not the real viewport. A portal sidesteps this for every
  // consumer/every ancestor stacking context at once, instead of chasing
  // it caller by caller (or touching DetailPanel's own slide animation,
  // out of scope here). No markup/class/role changes -- same DOM shape,
  // just a different mount point.
  return createPortal(
    <div
      ref={overlayRef}
      className={"modal-overlay" + (open ? " open" : "") + (overlayClassName ? " " + overlayClassName : "")}
      onClick={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose();
      }}
    >
      {open && (
        <div
          ref={containerRef}
          className={"modal-container" + (width === "wide" ? " modal-container--wide" : "")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedById}
          tabIndex={-1}
        >
          <div className="modal-header">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            <IconButton icon="close" label="Cerrar" disabled={closeDisabled} onClick={onClose} />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}
