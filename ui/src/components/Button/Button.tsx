/**
 * Button — DS atom, versión canónica del botón.
 *
 * Wrapper fino sobre las clases CSS reales de `button.css`
 * (.btn/.btn--primary/neutral/subtle/.btn--sm/lg/icon/.btn--danger) --
 * no las renombra, solo las arma a partir de una API semántica
 * (variant/tone/size) en vez de que cada pantalla escriba el
 * `className` a mano. Antes de este componente no existía ningún
 * <Button> en TSX -- 21 call sites armaban la clase manualmente (ver
 * docs/design-system/Button.spec.md, auditoría 2026-09-08).
 *
 * `size="icon"` exige `aria-label` y prohíbe `children` en el tipo
 * (unión discriminada más abajo) -- el error de accesibilidad de un
 * icon-only sin label pasa a ser un error de compilación, no algo que
 * dependa de auditar cada call site a mano.
 */
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";

export type ButtonVariant = "main" | "outlined" | "ghost";
export type ButtonTone = "neutral" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  main: "btn--primary",
  outlined: "btn--neutral",
  ghost: "btn--subtle",
};

const SIZE_CLASS: Partial<Record<ButtonSize, string>> = {
  sm: "btn--sm",
  lg: "btn--lg",
  icon: "btn--icon",
};

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "disabled" | "type" | "className" | "style"
>;

interface ButtonSharedProps extends NativeButtonProps {
  variant?: ButtonVariant;
  /** `neutral` (default) o `danger` -- `success`/`warning`/`info` quedan
   * pendientes por falta de evidencia real de uso (Button.spec.md §2.2). */
  tone?: ButtonTone;
  disabled?: boolean;
  /** Bloquea interacción (igual que `disabled`) y muestra un spinner en
   * el slot de iconLeft. El label de texto no cambia. */
  loading?: boolean;
  /** Solo para un Button individual actuando como *toggle* (no un grupo
   * -- para grupos usar `SelectionGroup`). Se traduce a `aria-pressed`. */
  selected?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  type?: "button" | "submit" | "reset";
  className?: string;
  style?: CSSProperties;
}

type ButtonWithLabelProps = ButtonSharedProps & {
  size?: Exclude<ButtonSize, "icon">;
  children: ReactNode;
};

type ButtonIconOnlyProps = ButtonSharedProps & {
  size: "icon";
  children?: never;
  /** Obligatorio: sin texto visible, el nombre accesible del botón
   * depende enteramente de este atributo. */
  "aria-label": string;
};

export type ButtonProps = ButtonWithLabelProps | ButtonIconOnlyProps;

/** Internal-only shape used to destructure the union above without TS
 * narrowing `size`/`children` down to one branch's literal type. */
type AnyButtonProps = ButtonSharedProps & {
  size?: ButtonSize;
  children?: ReactNode;
};

export function Button(props: ButtonProps) {
  const {
    variant = "main",
    tone = "neutral",
    size = "md",
    disabled = false,
    loading = false,
    selected,
    iconLeft,
    iconRight,
    type = "button",
    className,
    children,
    style: consumerStyle,
    ...rest
  } = props as AnyButtonProps;

  const isIconOnly = size === "icon";
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const lastWidthRef = useRef<number | null>(null);

  // Congela el ancho medido justo antes de que `loading` pase a true --
  // así un botón sin iconLeft (que gana el ancho del spinner recién al
  // entrar en loading) no se corre. Con iconLeft ya presente esto no
  // hace falta (el spinner ocupa el mismo slot), pero no tiene costo
  // dejarlo activo siempre.
  useEffect(() => {
    if (!loading && btnRef.current) {
      lastWidthRef.current = btnRef.current.getBoundingClientRect().width;
    }
  }, [loading, children]);

  const classes = [
    "btn",
    VARIANT_CLASS[variant],
    tone === "danger" ? "btn--danger" : null,
    SIZE_CLASS[size] ?? null,
    className ?? null,
  ]
    .filter((c): c is string => Boolean(c))
    .join(" ");

  const style: CSSProperties | undefined =
    loading && lastWidthRef.current != null
      ? { minWidth: lastWidthRef.current, ...consumerStyle }
      : consumerStyle;

  return (
    <button
      {...rest}
      ref={btnRef}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={selected === undefined ? undefined : selected}
      style={style}
    >
      {loading ? (
        <span className="btn__icon btn__icon--spinning" aria-hidden="true">
          <span className="material-symbols-outlined">
            {getIconGlyph("progress_activity")}
          </span>
        </span>
      ) : (
        iconLeft !== undefined && (
          <span className="btn__icon" aria-hidden="true">
            {iconLeft}
          </span>
        )
      )}
      {!isIconOnly && children}
      {!loading && iconRight !== undefined && (
        <span className="btn__icon" aria-hidden="true">
          {iconRight}
        </span>
      )}
    </button>
  );
}
