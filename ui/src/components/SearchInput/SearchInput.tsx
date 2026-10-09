/**
 * SearchInput — DS molecule. Formaliza (2026-09-09) el buscador ad-hoc
 * que vivía en `App.tsx` (`.aow-search__input`, un `<input>` + un
 * `<svg>` de lupa inline armados a mano) -- único consumidor real
 * encontrado en toda la app (verificado por grep). Migrado, mismo
 * comportamiento visual exacto: círculo de 34px en reposo (solo el
 * ícono, sin placeholder) que se expande a una pill de 240px al
 * enfocar o si ya hay texto -- ver `search-input.css`.
 *
 * No es un wrapper de `Input` (DS atom, `Field/Input.tsx`): ese no tiene
 * slot para el ícono absolutamente posicionado ni para el botón clear
 * que este patrón necesita, y forzarlo hubiera significado reconstruir
 * el mismo layout por fuera de todos modos. Sí reusa sus convenciones:
 * `type="search"`, controlled (`value`+`onChange`) o uncontrolled
 * (`defaultValue`), sin `required`/`invalid` (un buscador no valida).
 *
 * Nuevo respecto al patrón ad-hoc anterior (que no tenía ninguno de
 * los 3): botón clear (solo visible con texto -- que en este patrón
 * significa siempre "expanded", ver más abajo), Escape limpia si hay
 * texto (no-op si está vacío), Enter llama `onSubmit` si se pasa. Sin
 * debounce -- el buscador anterior tampoco lo tenía, y `onChange` sigue
 * siendo síncrono por cada tecla, igual que antes.
 *
 * `label` es obligatorio pero nunca se renderiza visible -- este patrón
 * (círculo/pill compacto) no tiene lugar para un `<label>` propio, así
 * que se usa como `aria-label` (antes, `App.tsx` reusaba el
 * `placeholder` como `aria-label`, un valor pensado para verse, no para
 * describir; ahora son props separadas, cada una con su propio rol).
 *
 * Sin `role="search"` en el wrapper: es un control compacto embebido en
 * un header ya estructurado (no una región de búsqueda dedicada de
 * página completa) -- agregar un landmark ahí sería semántica duplicada
 * sin necesidad real, no una omisión.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";

export interface SearchInputProps {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function SearchInput({
  label,
  value: controlledValue,
  defaultValue = "",
  onChange,
  onClear,
  onSubmit,
  placeholder,
  disabled = false,
  autoFocus = false,
  className,
}: SearchInputProps) {
  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const currentValue = isControlled ? controlledValue : uncontrolledValue;

  // Expanded arranca true si ya hay valor (p. ej. un caso restaurado
  // de una búsqueda previa) o si autoFocus va a enfocar el input de
  // inmediato -- nunca queremos el círculo resting con texto adentro
  // (no hay lugar para mostrarlo). Después de montar, foco/blur son la
  // única fuente de verdad -- ver los handlers de abajo.
  const [expanded, setExpanded] = useState(() => Boolean(currentValue) || autoFocus);
  const inputRef = useRef<HTMLInputElement>(null);

  function setValue(next: string) {
    if (!isControlled) setUncontrolledValue(next);
    onChange?.(next);
  }

  function handleClear() {
    setValue("");
    onClear?.();
    // Mantiene el foco en el input -- clickear clear no debe expulsar
    // al usuario del control que estaba usando.
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (!currentValue) return; // vacío -- Escape no hace nada, no es un cierre de overlay.
      e.stopPropagation();
      handleClear();
      return;
    }
    if (e.key === "Enter" && onSubmit) {
      onSubmit(currentValue);
    }
  }

  return (
    <div className={"aow-search" + (expanded ? " aow-search--expanded" : "") + (className ? " " + className : "")}>
      <span className="aow-search__icon" aria-hidden="true">
        <span className="material-symbols-outlined">{getIconGlyph("search")}</span>
      </span>
      <input
        ref={inputRef}
        type="search"
        className="aow-search__input"
        placeholder={expanded ? placeholder : ""}
        value={currentValue}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          if (!currentValue) setExpanded(false);
        }}
        aria-label={label}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {expanded && currentValue && (
        <button
          type="button"
          className="aow-search__clear"
          aria-label="Limpiar búsqueda"
          disabled={disabled}
          onClick={handleClear}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {getIconGlyph("close")}
          </span>
        </button>
      )}
    </div>
  );
}
