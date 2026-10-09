/**
 * Spinner — DS atom, formaliza el ícono `progress_activity` rotando
 * (src/styles/ds/atoms/spinner/spinner.css). Solo ícono/animación, sin
 * texto propio -- si hay contenido visible asociado (p. ej. "Cargando
 * casos…"), es un hermano en el markup del consumidor, no algo que este
 * átomo renderice él mismo.
 *
 * Migrado a los 3 consumidores reales donde el spinner es standalone
 * (tono/tamaño estáticos, no dependen del contexto del padre):
 * `Card.tsx` (`.card__processing-spinner`, tone="brand" size="sm"),
 * `ModalTriage.tsx` (`.tri-status__spinner`, tone="neutral" size="sm") y
 * `MilestoneProgress.tsx` (`.milestone-progress__spinner`, tone="brand"
 * size="xs" -- 2026-09-10, ver `size="xs"` más abajo). Los 3 ya eran
 * decorativos (`aria-hidden`, con texto visible al lado que ya comunica
 * el estado) -- se migran sin `label`, mismo comportamiento exacto.
 *
 * NO migrados a este componente (documentado, no un olvido -- ver el
 * docblock de `spinner.css` para el detalle completo de cada uno):
 * `Button`/`IconButton` (su spinner hereda `currentColor` del botón,
 * este átomo no modela "heredar"), y los 3 file-row de
 * ModalProgresoCarga/ModalAnonimizacion/ModalAnalisisDiferencial (el
 * ícono ahí es un slot de 4 estados, el spin es solo uno de ellos). Los
 * 5 sí reusan el mismo `@keyframes spinner-spin` -- ver ese archivo.
 *
 * `label`: si se pasa, se expone como nombre accesible vía
 * `role="status"` + `aria-label` (anuncia una sola vez al aparecer, no
 * repetidamente). Sin `label`, es puramente decorativo
 * (`aria-hidden="true"`) -- el caso de los 2 consumidores migrados,
 * donde el estado ya lo comunica un texto visible aparte.
 */
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";
export type SpinnerTone = "neutral" | "brand" | "inverse";

export interface SpinnerProps {
  label?: string;
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
}

const SIZE_CLASS: Record<SpinnerSize, string> = {
  xs: "spinner--xs",
  sm: "spinner--sm",
  md: "spinner--md",
  lg: "spinner--lg",
};

const TONE_CLASS: Record<SpinnerTone, string> = {
  neutral: "spinner--neutral",
  brand: "spinner--brand",
  inverse: "spinner--inverse",
};

export function Spinner({ label, size = "md", tone = "neutral", className }: SpinnerProps) {
  const classes = ["spinner", SIZE_CLASS[size], TONE_CLASS[tone], className]
    .filter((c): c is string => Boolean(c))
    .join(" ");

  return (
    <span className={classes} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="material-symbols-outlined" aria-hidden="true">
        {getIconGlyph("progress_activity")}
      </span>
    </span>
  );
}
