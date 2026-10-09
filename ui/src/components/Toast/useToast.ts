import { useContext } from "react";
import { ToastContext } from "./ToastContext";
import type { ToastApi } from "./types";

/** Hook para disparar feedback. Debe usarse dentro de un `ToastProvider`
 * (montado una sola vez en el root de la app, ver `main.tsx`) -- tira un
 * error explícito si no, en vez de fallar silenciosamente más adelante
 * con un `undefined.show is not a function`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast: no ToastProvider is mounted -- see src/main.tsx.");
  }
  return ctx;
}
