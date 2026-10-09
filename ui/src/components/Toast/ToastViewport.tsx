/**
 * ToastViewport — contenedor visual. Puramente presentacional, recibe
 * ya resuelto (`ToastProvider`) qué toasts mostrar, cuáles están
 * saliendo, y los callbacks -- no conoce timers ni dedupe.
 */
import { Toast } from "./Toast";
import type { ToastRecord } from "./types";

export interface ToastViewportProps {
  toasts: ToastRecord[];
  exitingIds: ReadonlySet<string>;
  onDismiss: (id: string) => void;
  onExited: (id: string) => void;
  onPauseChange: (id: string, paused: boolean) => void;
}

export function ToastViewport({ toasts, exitingIds, onDismiss, onExited, onPauseChange }: ToastViewportProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-viewport">
      {toasts.map((toast) => (
        <div className="toast-viewport__item" key={toast.id}>
          <Toast
            toast={toast}
            removing={exitingIds.has(toast.id)}
            onDismiss={onDismiss}
            onExited={onExited}
            onPauseChange={(paused) => onPauseChange(toast.id, paused)}
          />
        </div>
      ))}
    </div>
  );
}
