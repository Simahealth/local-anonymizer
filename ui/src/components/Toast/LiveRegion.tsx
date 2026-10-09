/**
 * LiveRegion — región accesible interna del `ToastProvider`, sin UI
 * visual propia (`.sr-only`, mismo utility class que `App.tsx` ya usaba
 * para su `[data-live-region]` original). Persistente en el DOM
 * mientras el provider esté montado -- nunca se desmonta entre
 * anuncios, solo cambia su `textContent` (ver `ToastProvider`).
 *
 * Dos regiones, una por `politeness` (`polite`/`assertive`), en vez de
 * una sola con el atributo cambiando dinámicamente -- cambiar
 * `aria-live` en caliente no es confiable entre lectores de pantalla
 * (algunos no vuelven a registrar la región); dos regiones fijas, cada
 * una con su propio `aria-live` desde el mount, es el patrón
 * recomendado (WAI-ARIA Authoring Practices).
 *
 * "Clear then set" (mismo truco que el `announce()` anterior): fuerza
 * el reanuncio incluso si el texto es idéntico al último mensaje.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";

export interface LiveRegionHandle {
  announce: (message: string, politeness: "polite" | "assertive") => void;
}

function setLiveRegionText(el: HTMLElement | null, message: string) {
  if (!el) return;
  el.textContent = "";
  // El cambio en el siguiente frame es lo que hace que un lector de
  // pantalla note la mutación -- limpiar y setear en el mismo tick a
  // veces se coalesce en una sola mutación observada (queda sin
  // reanunciar). Un frame alcanza, sin necesidad de un timeout largo.
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

export const LiveRegion = forwardRef<LiveRegionHandle>(function LiveRegion(_props, ref) {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    announce(message, politeness) {
      const target = politeness === "assertive" ? assertiveRef.current : politeRef.current;
      setLiveRegionText(target, message);
    },
  }));

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" ref={politeRef} />
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true" ref={assertiveRef} />
    </>
  );
});
