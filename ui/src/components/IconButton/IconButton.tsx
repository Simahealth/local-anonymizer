/**
 * IconButton — DS atom, formaliza `.icon-btn` (src/styles/ds/atoms/
 * button/icon-button.css). Wrapper fino, mismo espíritu que `Button`
 * (Button.tsx): mapea una API semántica (`size`/`tone`) a las clases
 * CSS reales, sin renombrarlas.
 *
 * Migrado a los 6 call sites reales que ya armaban este mismo
 * `<button className="icon-btn">` a mano (verificado por grep, QA
 * 2026-09-09): `Modal.tsx` (Cerrar), `DetailPanel.tsx` (Cerrar/Expandir/
 * Volver -- 3 botones), `DocumentSidePanel.tsx` (Cerrar),
 * `ComposerV2.tsx` (Cerrar), `ModalNuevoCaso.tsx` (Quitar archivo),
 * `Toast.tsx` (Cerrar notificación). Las clases resultantes son
 * idénticas a las que esos call sites ya escribían (`icon-btn`, o
 * `icon-btn toast__close` en Toast vía `className`) -- cero cambio
 * visual.
 *
 * `.sidebar-toggle` (LeftPanel) NO se migra a propósito: alterna entre
 * 2 identidades visuales completas, un patrón que este componente no
 * modela (ver icon-button.css's propio docblock y el comentario ya
 * existente en LeftPanel.tsx).
 *
 * No se mezcla con el patrón de "Nota" que revela texto en hover/focus
 * (`NoteTriggerV2`/`.note-cta`, Molecules → "Note item / trigger") --
 * ese es un control con texto asociado que aparece condicionalmente,
 * semánticamente distinto de un icon-only puro; se documenta aparte,
 * no se fuerza dentro de este átomo.
 */
import type { ButtonHTMLAttributes } from "react";
import { getIconGlyph, type IconName } from "../../styles/ds/foundations/icons/icons";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonTone = "neutral" | "brand" | "danger";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "disabled" | "type" | "className" | "aria-label"
>;

export interface IconButtonProps extends NativeButtonProps {
  icon: IconName;
  label: string;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
}

const SIZE_CLASS: Partial<Record<IconButtonSize, string>> = {
  sm: "icon-btn--sm",
  lg: "icon-btn--lg",
};

const TONE_CLASS: Partial<Record<IconButtonTone, string>> = {
  brand: "icon-btn--brand",
  danger: "icon-btn--danger",
};

export function IconButton({
  icon,
  label,
  size = "md",
  tone = "neutral",
  disabled = false,
  loading = false,
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  const classes = ["icon-btn", SIZE_CLASS[size], TONE_CLASS[tone], className]
    .filter((c): c is string => Boolean(c))
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="material-symbols-outlined icon-btn__icon--spinning" aria-hidden="true">
          {getIconGlyph("progress_activity")}
        </span>
      ) : (
        <span className="material-symbols-outlined" aria-hidden="true">
          {getIconGlyph(icon)}
        </span>
      )}
    </button>
  );
}
