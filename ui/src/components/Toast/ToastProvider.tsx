/**
 * ToastProvider — monta el viewport de toasts y la LiveRegion
 * persistente. Se monta UNA sola vez en el root de la app (ver
 * `main.tsx`) -- reemplaza los dos canales paralelos que existían
 * antes (`src/utils/toast.ts`'s `showToast()`, DOM manual vía
 * `document.body.appendChild`; `src/utils/announce.ts`'s `announce()`,
 * query directo a `[data-live-region]`). Ambos archivos quedan
 * eliminados, ver `useToast()` y el `announce` que expone este mismo
 * provider como su reemplazo unificado.
 *
 * Timers: cada toast con duración finita programa su propio
 * `setTimeout`. Hover/focus (`Toast.tsx`'s `onPauseChange`) pausa ese
 * timer guardando cuánto faltaba (`remaining`) y lo retoma desde ahí al
 * salir el mouse/perder el foco -- no reinicia la cuenta completa.
 *
 * Dedupe: si `show()` llega con el mismo `tone`+`message` de un toast
 * YA visible (no en proceso de salida), no crea uno nuevo -- resetea la
 * duración del existente y no vuelve a anunciarlo en la LiveRegion
 * (evita el spam de anuncios idénticos que pedía el ticket).
 *
 * `maxVisible` (default 3): al superarlo, el toast MÁS VIEJO todavía
 * visible se descarta de inmediato (mismo `dismiss()` que un cierre
 * manual) para hacerle lugar al nuevo -- no hay cola de espera, "no
 * crear una cola compleja si no hace falta".
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { LiveRegion, type LiveRegionHandle } from "./LiveRegion";
import { ToastViewport } from "./ToastViewport";
import { ToastContext } from "./ToastContext";
import type { ToastApi, ToastOptions, ToastPoliteness, ToastRecord, ToastProviderProps, ToastTone } from "./types";

const DEFAULT_DURATION: Record<ToastTone, number> = {
  neutral: 4500,
  success: 4500,
  info: 4500,
  warning: 6000,
  error: 7000,
};

function resolveDuration(tone: ToastTone, explicit: number | undefined, hasAction: boolean): number {
  if (explicit !== undefined) return explicit;
  // Error/warning CON acción: requiere cierre manual (no se auto-cierra
  // mientras el usuario todavía podría querer usar esa acción).
  if (hasAction && (tone === "error" || tone === "warning")) return Infinity;
  return DEFAULT_DURATION[tone];
}

interface TimerEntry {
  timeoutId: ReturnType<typeof setTimeout> | null;
  duration: number;
  startedAt: number;
  remaining: number;
  paused: boolean;
}

export function ToastProvider({ children, maxVisible = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [exitingIds, setExitingIds] = useState<ReadonlySet<string>>(new Set());
  const liveRegionRef = useRef<LiveRegionHandle>(null);
  const timers = useRef(new Map<string, TimerEntry>());
  const idCounter = useRef(0);

  const beginExit = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer?.timeoutId) clearTimeout(timer.timeoutId);
    setExitingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleExited = useCallback((id: string) => {
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setExitingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      beginExit(id);
    },
    [beginExit],
  );

  const armTimer = useCallback(
    (id: string, duration: number) => {
      if (!Number.isFinite(duration)) {
        timers.current.set(id, { timeoutId: null, duration, startedAt: Date.now(), remaining: duration, paused: false });
        return;
      }
      const timeoutId = setTimeout(() => beginExit(id), duration);
      timers.current.set(id, { timeoutId, duration, startedAt: Date.now(), remaining: duration, paused: false });
    },
    [beginExit],
  );

  const handlePauseChange = useCallback((id: string, paused: boolean) => {
    const timer = timers.current.get(id);
    if (!timer || !Number.isFinite(timer.duration)) return; // sin auto-dismiss, nada que pausar
    if (paused === timer.paused) return;

    if (paused) {
      if (timer.timeoutId) clearTimeout(timer.timeoutId);
      const elapsed = Date.now() - timer.startedAt;
      timer.remaining = Math.max(0, timer.remaining - elapsed);
      timer.timeoutId = null;
      timer.paused = true;
    } else {
      timer.startedAt = Date.now();
      timer.timeoutId = setTimeout(() => beginExit(id), timer.remaining);
      timer.paused = false;
    }
  }, [beginExit]);

  const show = useCallback<ToastApi["show"]>(
    (options: ToastOptions) => {
      const tone = options.tone ?? "neutral";
      const politeness: ToastPoliteness = options.politeness ?? (tone === "error" ? "assertive" : "polite");
      const dismissible = options.dismissible ?? true;
      const duration = resolveDuration(tone, options.duration, !!options.action);

      // Dedupe: mismo tone+message ya visible (no saliendo) -> refresca
      // su duración, no crea uno nuevo ni vuelve a anunciar.
      const existing = toasts.find(
        (t) => t.tone === tone && t.message === options.message && !exitingIds.has(t.id),
      );
      if (existing) {
        const timer = timers.current.get(existing.id);
        if (timer?.timeoutId) clearTimeout(timer.timeoutId);
        armTimer(existing.id, duration);
        return existing.id;
      }

      const id = options.id ?? `toast-${++idCounter.current}`;
      const record: ToastRecord = {
        id,
        tone,
        message: options.message,
        description: options.description,
        duration,
        action: options.action,
        dismissible,
        politeness,
        createdAt: Date.now(),
      };

      setToasts((prev) => {
        const next = [...prev, record];
        if (next.length <= maxVisible) return next;
        // "Máximo visible recomendado: 3" -- descarta de inmediato los
        // más viejos que excedan el límite (sin animación de salida:
        // nunca llegaron a montarse visualmente, no hay nada que
        // animar; y sin cola de espera, el mensaje simplemente no
        // llega a mostrarse si el usuario ya tiene 3 toasts activos).
        const dropped = next.slice(0, next.length - maxVisible);
        for (const d of dropped) timers.current.delete(d.id);
        return next.slice(next.length - maxVisible);
      });
      armTimer(id, duration);
      liveRegionRef.current?.announce(options.message, politeness);
      return id;
    },
    [toasts, exitingIds, maxVisible, armTimer],
  );

  const announce = useCallback<ToastApi["announce"]>((message, politeness = "polite") => {
    liveRegionRef.current?.announce(message, politeness);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss, announce }), [show, dismiss, announce]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <LiveRegion ref={liveRegionRef} />
      <ToastViewport
        toasts={toasts}
        exitingIds={exitingIds}
        onDismiss={dismiss}
        onExited={handleExited}
        onPauseChange={handlePauseChange}
      />
    </ToastContext.Provider>
  );
}
