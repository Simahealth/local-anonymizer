/**
 * Badge — DS atom, formaliza `.status-badge` (src/styles/ds/atoms/badge/).
 *
 * No interactivo -- siempre `<span>`, nunca `<button>` (comunica estado,
 * no dispara una acción). Reusa la estructura/tokens compartidos por
 * toda la "badge family" (`badge-base.css`: `.status-badge`/`.tag`/
 * `.metric-chip`), pero con un set de tonos genérico (`Tone`) en vez de
 * los 10 nombres de estado de pipeline que `status-badge.css` ya tenía
 * (queued/processed/failed/analyzing/pending/validated/rejected/
 * cancelled/archived/reprocessing) -- ese vocabulario específico de
 * pipeline no tiene ningún consumidor real hoy (verificado por grep,
 * QA 2026-09-09), así que en vez de forzar ese vocabulario en la API del
 * componente, `tone` expresa el semantic role (success/warning/error/
 * info/neutral) y el texto del propio `children` sigue diciendo
 * "Procesado"/"Validado"/etc. -- el consumidor que aparezca elige sus
 * propias palabras, el componente solo resuelve el color.
 *
 * `tone="info"` no tiene token propio en `tokens.css` (mismo gap ya
 * documentado en Toast) -- reusa `--sima-blue`/`--text-brand-dark`, el
 * azul existente más cercano, mismo `color-mix` que `.tag--accent` ya
 * usa.
 *
 * Sin consumidor real en producto hoy (a diferencia de `Tag`, que sí
 * migró 4 call sites reales) -- ver docs/design-system/index.html →
 * Deuda / On-demand. Implementado igual, con QA completa, porque
 * formaliza en TSX un spec de CSS que ya existía sin wrapper (no una
 * anticipación especulativa de un componente nuevo).
 */
import type { FocusEvent, MouseEvent, ReactNode } from "react";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: IconName;
  className?: string;
  /** Tooltip DS support only (DetailPanel evidence/status badges) --
   * Badge stays non-actionable by design (no `onClick`, see docstring
   * above), but a consumer wrapping it in `Tooltip` needs these
   * forwarded onto the underlying `<span>` for hover/focus and
   * `aria-describedby` to work. Not meant to be set by hand otherwise. */
  tabIndex?: number;
  "aria-describedby"?: string;
  onMouseEnter?: (e: MouseEvent<HTMLSpanElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLSpanElement>) => void;
  onFocus?: (e: FocusEvent<HTMLSpanElement>) => void;
  onBlur?: (e: FocusEvent<HTMLSpanElement>) => void;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "badge--neutral",
  success: "badge--success",
  warning: "badge--warning",
  error: "badge--error",
  info: "badge--info",
};

export function Badge({
  children,
  tone = "neutral",
  size = "md",
  icon,
  className,
  tabIndex,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: BadgeProps) {
  const classes = ["badge", TONE_CLASS[tone], size === "sm" ? "badge--sm" : null, className]
    .filter((c): c is string => Boolean(c))
    .join(" ");

  return (
    <span
      className={classes}
      tabIndex={tabIndex}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      {...rest}
    >
      {icon && (
        <span className="badge__icon" aria-hidden="true">
          <span className="material-symbols-outlined">{getIconGlyph(icon)}</span>
        </span>
      )}
      {children}
    </span>
  );
}
