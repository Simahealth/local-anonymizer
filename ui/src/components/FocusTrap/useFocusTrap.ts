/**
 * useFocusTrap — DS primitive. Foco de overlays (Modal/DetailPanel/
 * DocumentSidePanel/ComposerV2 lo consumen, ver `FocusTrap.tsx` para el
 * wrapper opcional). Sin UI propia -- no impone roles/aria/estilos/
 * z-index/scroll-lock, solo maneja `document.activeElement` mientras
 * `active` es `true`.
 *
 * Antes de esto, 3 implementaciones independientes y ligeramente
 * distintas de lo mismo: `DetailPanel.tsx` (`getFocusable` local,
 * selector `button, [href], [tabindex]:not([tabindex="-1"])`, sin
 * excluir disabled explícitamente), `ComposerV2.tsx` (selector con
 * `input, select, textarea` además, exclusión de disabled + `[hidden]`
 * ancestro) y `Modal.tsx` (sin trap de Tab en absoluto, solo foco
 * inicial en el contenedor + Escape). Esta es la fusión: el selector más
 * completo de las tres (agrega `[contenteditable="true"]`, excluye
 * `visibility:hidden` explícitamente -- ninguna de las tres lo hacía,
 * aunque el comentario de DetailPanel ya asumía que
 * `.detail-panel__pane--case` en `visibility:hidden` quedaba fuera del
 * tab order del navegador; ahora también queda fuera del cálculo propio
 * de este hook, no solo del navegador).
 *
 * Contrato de foco (igual para los 4 consumidores, sin excepciones):
 *   - Al activarse: guarda `document.activeElement`, mueve el foco a
 *     `initialFocusRef` si existe: si no, al primer focuseable dentro
 *     del contenedor; si no hay ninguno, al contenedor mismo
 *     (`tabIndex={-1}` es responsabilidad del consumidor, este hook no
 *     lo agrega).
 *   - Mientras está activo: Tab/Shift+Tab ciclan dentro del contenedor
 *     si `containTab !== false`; Escape llama `onEscape` si
 *     `escapeDisabled` no es `true`.
 *   - Al desactivarse: si `restoreFocus !== false`, foco a
 *     `returnFocusRef` si existe, si no al elemento previamente
 *     enfocado -- solo si ese elemento sigue en el DOM (nunca lanza si
 *     fue desmontado).
 *
 * Los callbacks/flags (`onEscape`, `escapeDisabled`, `containTab`,
 * `restoreFocus`, `returnFocusRef`) se leen desde un ref actualizado en
 * cada render, no desde las dependencias de los `useEffect` -- los 4
 * consumidores reales pasan closures/refs que cambian de identidad en
 * cada render (p. ej. DetailPanel's `onEscape` depende de `openSource`),
 * y unos efectos dependientes de esos valores re-ejecutarían la lógica
 * de "foco inicial" en cada render mientras el overlay sigue abierto,
 * robándole el foco al usuario a mitad de una interacción.
 */
import { useEffect, useRef, type RefObject } from "react";

export interface UseFocusTrapOptions {
  containerRef: RefObject<HTMLElement | null>;
  active: boolean;
  /** Default: true. */
  restoreFocus?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: () => void;
  /** Default: false. Cuando es true, Escape no hace nada -- para
   * overlays anidados donde solo el superior debe responder (ver
   * Modal/Z1DrilldownModal, `escapeDisabled`). */
  escapeDisabled?: boolean;
  /** Default: true. Cuando es false, Tab sigue el orden natural del
   * documento -- el consumidor decide no atrapar el foco. */
  containTab?: boolean;
}

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled)",
  "textarea:not(:disabled)",
  "select:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

/**
 * "Sin dimensión visible" se resuelve por CSS (`display`/`visibility`
 * computados), no por `offsetWidth`/`offsetHeight`/`getClientRects()` --
 * esas tres API dependen de un motor de layout real. jsdom (el entorno
 * de estos tests) no lo tiene: reporta 0 y `offsetParent: null` para
 * TODO elemento sin excepción, oculto o no -- confirmado empíricamente
 * antes de escribir esto (un `<button>` de prueba, sin ningún CSS de
 * ocultamiento, midió 0×0/`getClientRects().length===0` igual). Filtrar
 * por dimensión real habría hecho que este hook cayera siempre al
 * fallback de "sin focuseables" en cualquier test, no solo en jsdom --
 * mismo problema que motivó a la librería `tabbable` (no usada acá, solo
 * la misma técnica) a evitar ese chequeo. `display:none` de un
 * ancestro sí se resuelve acá (recorriendo hacia arriba, ya que
 * `display` no es una propiedad heredada -- `getComputedStyle` del
 * propio elemento nunca refleja el `display:none` de un padre).
 * `visibility` SÍ es heredada, así que el propio elemento alcanza para
 * detectar un ancestro `visibility:hidden` (el caso real de
 * `DetailPanel`'s `.detail-panel__pane--case` mientras SourceDetail está
 * abierto).
 */
function isVisible(el: HTMLElement): boolean {
  if (el.hidden || el.closest("[hidden]")) return false;
  if (el.getAttribute("aria-hidden") === "true" || el.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (style.display === "none") return false;
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/** Orden real del documento -- `Node.compareDocumentPosition`, no el
 * orden en que `querySelectorAll` devuelve los resultados. Bug real
 * encontrado en esta QA: con un selector agrupado por comas (el que usa
 * este módulo), el motor de selectores de jsdom (nwsapi) NO garantiza
 * orden de documento entre distintas cláusulas del grupo -- devuelve
 * todos los `<button>` primero, después los `<input>`, etc., sin
 * importar su posición real en el árbol. Fuera de jsdom (navegador
 * real) `querySelectorAll` sí está especificado para devolver orden de
 * documento siempre, pero ordenar acá explícitamente no tiene costo real
 * (listas de foco típicamente chicas) y hace que el comportamiento sea
 * el mismo en ambos entornos -- sin este sort, Tab podía saltar a un
 * elemento que no era ni el siguiente ni el anterior real en pantalla. */
function byDocumentOrder(a: Element, b: Element): number {
  const position = a.compareDocumentPosition(b);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/** Focuseables reales dentro de `container`, en orden del DOM -- ver
 * docblock del módulo para el selector y las exclusiones. Exportado
 * porque `Modal`/`DetailPanel`/etc. no necesitan reimplementar su propia
 * versión si alguna vez necesitan la lista sin el resto del hook. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(
      // `tabIndex !== -1` es un filtro aparte, no parte del selector CSS:
      // `button:not(:disabled)` (y el resto de las etiquetas nativas)
      // matchean igual aunque el elemento tenga `tabindex="-1"` explícito
      // -- la cláusula `[tabindex]:not([tabindex="-1"])` del selector solo
      // cubre elementos que son focuseables ÚNICAMENTE por tabindex (p.
      // ej. un div), no excluye un `<button tabindex="-1">`. tabindex=-1
      // en cualquier elemento, nativo o no, significa "fuera del orden de
      // tabulación" -- se excluye siempre, sin importar qué cláusula del
      // selector lo capturó.
      (el) => el.tabIndex !== -1 && isVisible(el),
    )
    .sort(byDocumentOrder);
}

export function useFocusTrap(options: UseFocusTrapOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef(false);

  const { active } = options;

  // Foco inicial (al activarse) / restauración (al desactivarse). Un
  // solo efecto, gateado únicamente por `active` -- ver docblock del
  // módulo sobre por qué el resto de las opciones se leen de
  // `optionsRef.current` en vez de ir en el arreglo de dependencias.
  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      previouslyFocusedRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      const { containerRef, initialFocusRef } = optionsRef.current;
      const container = containerRef.current;
      const target =
        initialFocusRef?.current ??
        (container ? getFocusableElements(container)[0] : undefined) ??
        container ??
        null;
      target?.focus({ preventScroll: true });
      return;
    }

    // Nunca estuvo activo (montaje inicial con active=false) -- nada
    // que restaurar.
    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;

    const { restoreFocus = true, returnFocusRef } = optionsRef.current;
    if (!restoreFocus) {
      previouslyFocusedRef.current = null;
      return;
    }
    const target = returnFocusRef?.current ?? previouslyFocusedRef.current;
    if (target && document.body.contains(target)) {
      target.focus({ preventScroll: true });
    }
    previouslyFocusedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver docblock: el resto de las opciones se lee de optionsRef, no deben re-disparar este efecto
  }, [active]);

  // Escape + Tab, solo mientras está activo. Mismo motivo de
  // `optionsRef` que arriba: el listener se suscribe una vez por
  // transición de `active`, no en cada render.
  useEffect(() => {
    if (!active) return;

    function onKeyDown(e: KeyboardEvent) {
      const { onEscape, escapeDisabled = false, containTab = true, containerRef } = optionsRef.current;

      if (e.key === "Escape") {
        if (!escapeDisabled) {
          e.preventDefault();
          onEscape?.();
        }
        return;
      }

      if (e.key !== "Tab" || !containTab) return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        // Nada focuseable adentro -- el foco no debe escapar igual.
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
