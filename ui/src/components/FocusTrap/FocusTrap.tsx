/**
 * FocusTrap — wrapper opcional sobre `useFocusTrap`. Clona `children`
 * (un único elemento, el overlay real) para adjuntarle el `ref` que el
 * hook necesita -- no envuelve nada en un `<div>` extra, no agrega
 * ningún rol/aria/clase propia: el elemento que renderiza el consumidor
 * es exactamente el que llega al DOM, con su propio `role="dialog"`/
 * `aria-modal`/clases intactas.
 *
 * Los 4 consumidores reales de esta migración (Modal, DetailPanel,
 * DocumentSidePanel, ComposerV2) usan `useFocusTrap` directamente, no
 * este wrapper -- todos ya tenían su propio `ref` de contenedor con otros
 * usos (scroll reset, etc.), así que fusionar ese ref con el de
 * `FocusTrap` sería más código que llamar al hook una línea más abajo.
 * Este componente existe para la API pedida y para un futuro consumidor
 * que no necesite su propio ref.
 */
import { cloneElement, isValidElement, useRef, type ReactElement } from "react";
import { useFocusTrap, type UseFocusTrapOptions } from "./useFocusTrap";

export type FocusTrapProps = Omit<UseFocusTrapOptions, "containerRef"> & {
  children: ReactElement;
};

export function FocusTrap({ children, ...options }: FocusTrapProps) {
  const containerRef = useRef<HTMLElement | null>(null);

  useFocusTrap({ ...options, containerRef });

  if (!isValidElement<{ ref?: React.Ref<HTMLElement> }>(children)) {
    throw new Error("FocusTrap: `children` must be a single element (the actual overlay).");
  }

  return cloneElement(children, { ref: containerRef });
}
