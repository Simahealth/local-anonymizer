/**
 * Toast — pieza visual individual. Sin `aria-live`/`role` propio: el
 * anuncio accesible lo hace `LiveRegion` por separado (ver
 * `ToastProvider`) -- si este componente TAMBIÉN tuviera su propio
 * `role="status"`, un lector de pantalla anunciaría el mensaje dos
 * veces (una por cada región). Decoupled a propósito.
 *
 * Ciclo de vida (entering -> visible -> exiting -> dismissed), mismo
 * mecanismo que el `showToast()` anterior: monta con opacity/transform
 * en su posición "afuera", un frame después agrega `.toast--in`
 * (dispara la transición de entrada -- agregarla en el mismo frame del
 * mount no anima nada). Al salir, el padre (`ToastProvider`) marca
 * `removing=true`; este componente quita `.toast--in` y espera
 * `transitionend` (con un fallback por timeout, por si `prefers-
 * reduced-motion` ya bajó la transición a ~0ms y el evento no llega a
 * tiempo) antes de avisarle al padre que ya puede sacarlo del array
 * (`onExited`) -- recién ahí se desmonta de verdad.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";
import type { ToastRecord, ToastTone } from "./types";

const TONE_ICON: Record<ToastTone, IconName | null> = {
  neutral: null,
  success: "check_circle",
  warning: "warning",
  error: "error",
  info: "info",
};

export interface ToastProps {
  toast: ToastRecord;
  removing: boolean;
  onDismiss: (id: string) => void;
  onExited: (id: string) => void;
  onPauseChange: (paused: boolean) => void;
}

export function Toast({ toast, removing, onDismiss, onExited, onPauseChange }: ToastProps) {
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!removing) return;
    const el = rootRef.current;
    const fallback = setTimeout(() => onExited(toast.id), 400);
    function handleTransitionEnd() {
      clearTimeout(fallback);
      onExited(toast.id);
    }
    el?.addEventListener("transitionend", handleTransitionEnd, { once: true });
    return () => {
      el?.removeEventListener("transitionend", handleTransitionEnd);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onExited/toast.id son estables por el ciclo de vida de este toast puntual
  }, [removing]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onDismiss(toast.id);
    }
  }

  const icon = TONE_ICON[toast.tone];
  const classes = ["toast", `toast--${toast.tone}`, entered && !removing ? "toast--in" : null]
    .filter((c): c is string => Boolean(c))
    .join(" ");

  return (
    <div
      ref={rootRef}
      className={classes}
      tabIndex={-1}
      onMouseEnter={() => onPauseChange(true)}
      onMouseLeave={() => onPauseChange(false)}
      onFocus={() => onPauseChange(true)}
      onBlur={() => onPauseChange(false)}
      onKeyDown={handleKeyDown}
    >
      {icon && (
        <span className="toast__icon" aria-hidden="true">
          <span className="material-symbols-outlined">{getIconGlyph(icon)}</span>
        </span>
      )}
      <div className="toast__content">
        <p className="toast__message">{toast.message}</p>
        {toast.description && <p className="toast__description">{toast.description}</p>}
        {toast.action && (
          <div className="toast__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                toast.action!.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </Button>
          </div>
        )}
      </div>
      {toast.dismissible && (
        <IconButton
          icon="close"
          label="Cerrar notificación"
          className="toast__close"
          onClick={() => onDismiss(toast.id)}
        />
      )}
    </div>
  );
}
