import type { ReactNode } from "react";

export type ToastTone = "neutral" | "success" | "warning" | "error" | "info";
export type ToastPoliteness = "polite" | "assertive";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  tone?: ToastTone;
  message: string;
  description?: string;
  /** ms. Default por tono (ver DEFAULT_DURATION en ToastProvider) --
   * `Infinity` deshabilita el auto-dismiss (requiere cierre manual). */
  duration?: number;
  action?: ToastAction;
  /** Default: true. */
  dismissible?: boolean;
  /** Default: "polite". "assertive" solo para errores importantes --
   * ver docblock de ToastProvider. */
  politeness?: ToastPoliteness;
}

/** Forma interna, normalizada -- lo que efectivamente vive en el estado
 * del provider y lo que recibe `Toast.tsx`. `ToastOptions` es la API
 * pública (todo opcional salvo `message`); esto es lo mismo ya resuelto
 * con sus defaults aplicados. */
export interface ToastRecord {
  id: string;
  tone: ToastTone;
  message: string;
  description?: string;
  duration: number;
  action?: ToastAction;
  dismissible: boolean;
  politeness: ToastPoliteness;
  createdAt: number;
}

export interface ToastApi {
  /** Muestra un toast visual + lo anuncia en la LiveRegion. Devuelve el
   * `id` (el pasado en `options.id`, o uno generado). Si ya existe un
   * toast visible con el mismo `tone`+`message` (dedupe), no crea uno
   * nuevo -- refresca la duración del existente en su lugar. */
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  /** Anuncio accesible SIN toast visual -- reemplaza el `announce()`
   * suelto anterior (`src/utils/announce.ts`, eliminado). Para casos
   * como "Detalle abierto: X" que nunca fueron un toast (no son un
   * evento transitorio que amerite UI visual, solo contexto para
   * lectores de pantalla). */
  announce: (message: string, politeness?: ToastPoliteness) => void;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Default: 3. */
  maxVisible?: number;
}
