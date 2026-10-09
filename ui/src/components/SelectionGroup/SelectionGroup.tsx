/**
 * React port of SimahealthDS/molecules/selection-group/selection-group.js.
 * Same classes/attributes (.selection-group, .selection-group__item,
 * data-mode, data-sg-key, aria-pressed) and the same keyboard contract
 * (roving tabindex; Arrow Left/Right/Up/Down + Home/End move focus; Space/
 * Enter select via the browser's native button click) -- but state is
 * lifted to the caller (`items`/`onChange`) instead of mutating the DOM
 * in place, since React owns re-renders here. The vanilla module's
 * `sg:change` custom event becomes this component's `onChange(value,
 * values)` callback -- same two-value shape (last toggled value + all
 * currently active values), just a prop instead of a DOM event.
 */
import { useEffect, useRef, useState } from "react";

export interface SelectionGroupItem {
  value: string;
  label: string;
  active?: boolean;
  hidden?: boolean;
}

export interface SelectionGroupProps {
  label: string;
  sgKey: string;
  mode?: "single" | "multiple";
  items: SelectionGroupItem[];
  more?: { label: string };
  onMoreClick?: () => void;
  onChange: (value: string, values: string[]) => void;
  /** chat 2026-09-27 ("pongamos esa abreviatura como tag seleccionable"):
   * skips the built-in `.sidebar-z3-filter-label` span (a 10px sidebar-
   * scale label, wrong outside a Z3 filter group) when the caller
   * already renders its own label elsewhere (e.g. a form `Field`-style
   * wrapper) -- `aria-label={label}` on the group itself still carries
   * the accessible name either way, so this is purely visual. */
  hideLabel?: boolean;
}

export function SelectionGroup({
  label,
  sgKey,
  mode = "single",
  items,
  more,
  onMoreClick,
  onChange,
  hideLabel = false,
}: SelectionGroupProps) {
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeValue = items.find((i) => i.active)?.value;
  const fallback = items[0]?.value ?? "";
  const [rovingValue, setRovingValue] = useState<string>(
    activeValue ?? fallback,
  );

  // The vanilla init() picks the active item (or the first item) as the
  // sole tab stop. Re-sync whenever the active selection changes from
  // outside a click in this group (e.g. a filter reset).
  useEffect(() => {
    if (activeValue !== undefined) setRovingValue(activeValue);
  }, [activeValue]);

  function handleClick(item: SelectionGroupItem) {
    setRovingValue(item.value);
    if (mode === "single") {
      onChange(item.value, [item.value]);
      return;
    }
    const isActive = item.active === true;
    const values = isActive
      ? items
          .filter((i) => i.active && i.value !== item.value)
          .map((i) => i.value)
      : [...items.filter((i) => i.active).map((i) => i.value), item.value];
    onChange(item.value, values);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("selection-group__item")) return;
    const currentValue = target.dataset.sgValue;
    const idx = items.findIndex((i) => i.value === currentValue);
    if (idx === -1) return;

    let nextIdx: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIdx = (idx + 1) % items.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIdx = (idx - 1 + items.length) % items.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIdx = items.length - 1;
    }
    if (nextIdx === null) return;
    const nextItem = items[nextIdx];
    if (!nextItem) return;
    setRovingValue(nextItem.value);
    itemRefs.current[nextItem.value]?.focus();
  }

  return (
    <>
      {!hideLabel && <span className="sidebar-z3-filter-label">{label}</span>}
      <div
        className="selection-group"
        data-mode={mode}
        data-size="sm"
        data-sg-key={sgKey}
        role="group"
        aria-label={label}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <button
            key={item.value}
            ref={(el) => {
              itemRefs.current[item.value] = el;
            }}
            type="button"
            className="selection-group__item"
            data-sg-value={item.value}
            aria-pressed={item.active ? "true" : "false"}
            tabIndex={item.value === rovingValue ? 0 : -1}
            hidden={item.hidden}
            onClick={() => handleClick(item)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {more && (
        <button
          type="button"
          className="sidebar-z3-group-more"
          data-tp-group-more
          onClick={onMoreClick}
        >
          {more.label}
        </button>
      )}
    </>
  );
}
