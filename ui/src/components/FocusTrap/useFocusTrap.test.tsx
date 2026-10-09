import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState, type ReactNode } from "react";
import { useFocusTrap, type UseFocusTrapOptions } from "./useFocusTrap";

type Harness = Omit<UseFocusTrapOptions, "containerRef" | "active"> & {
  initialActive?: boolean;
  children: ReactNode;
  /** Rendered outside the trapped container -- for restore-focus-to-
   * previously-focused-element tests. */
  outside?: ReactNode;
};

function TrapHarness({ initialActive = true, children, outside, ...options }: Harness) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialActive);
  useFocusTrap({ ...options, containerRef, active });
  return (
    <div>
      {outside}
      <button type="button" onClick={() => setActive((a) => !a)}>
        toggle
      </button>
      {active && (
        <div ref={containerRef} tabIndex={-1} data-testid="container">
          {children}
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap — foco inicial", () => {
  it("mueve el foco a initialFocusRef si existe", () => {
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      const initialFocusRef = useRef<HTMLButtonElement>(null);
      useFocusTrap({ containerRef, active: true, initialFocusRef });
      return (
        <div ref={containerRef} tabIndex={-1}>
          <button type="button">Primero</button>
          <button type="button" ref={initialFocusRef}>
            Segundo (initial)
          </button>
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole("button", { name: "Segundo (initial)" })).toHaveFocus();
  });

  it("sin initialFocusRef, cae al primer elemento focuseable", () => {
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, active: true });
      return (
        <div ref={containerRef} tabIndex={-1}>
          <button type="button">Primero</button>
          <button type="button">Segundo</button>
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("sin ningún focuseable, cae al contenedor", () => {
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, active: true });
      return (
        <div ref={containerRef} tabIndex={-1} data-testid="container">
          <p>Sin controles</p>
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByTestId("container")).toHaveFocus();
  });

  it("ignora disabled/hidden/aria-hidden/tabindex=-1 al elegir el primer focuseable", () => {
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap({ containerRef, active: true });
      return (
        <div ref={containerRef} tabIndex={-1}>
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button" hidden>
            Hidden
          </button>
          <button type="button" aria-hidden="true" style={{ display: "block" }}>
            Aria-hidden
          </button>
          <button type="button" tabIndex={-1}>
            Tabindex -1
          </button>
          <button type="button">Real primero habilitado</button>
        </div>
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole("button", { name: "Real primero habilitado" })).toHaveFocus();
  });
});

describe("useFocusTrap — Tab / Shift+Tab ciclan dentro", () => {
  it("Tab en el último elemento vuelve al primero", async () => {
    const user = userEvent.setup();
    render(
      <TrapHarness>
        <button type="button">A</button>
        <button type="button">B</button>
      </TrapHarness>,
    );
    screen.getByRole("button", { name: "B" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "A" })).toHaveFocus();
  });

  it("Shift+Tab en el primer elemento va al último", async () => {
    const user = userEvent.setup();
    render(
      <TrapHarness>
        <button type="button">A</button>
        <button type="button">B</button>
      </TrapHarness>,
    );
    screen.getByRole("button", { name: "A" }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "B" })).toHaveFocus();
  });

  it("containTab=false deja el Tab sin interceptar", async () => {
    const user = userEvent.setup();
    render(
      <TrapHarness containTab={false}>
        <button type="button">A</button>
        <button type="button">B</button>
      </TrapHarness>,
    );
    screen.getByRole("button", { name: "B" }).focus();
    await user.tab();
    // Sin trap, Tab avanza al siguiente focuseable del documento --
    // "toggle" (fuera del contenedor), no vuelve a "A".
    expect(screen.getByRole("button", { name: "A" })).not.toHaveFocus();
  });
});

describe("useFocusTrap — Escape", () => {
  it("llama onEscape", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    render(
      <TrapHarness onEscape={onEscape}>
        <button type="button">A</button>
      </TrapHarness>,
    );
    await user.keyboard("{Escape}");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("escapeDisabled bloquea Escape", async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();
    render(
      <TrapHarness onEscape={onEscape} escapeDisabled>
        <button type="button">A</button>
      </TrapHarness>,
    );
    await user.keyboard("{Escape}");
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe("useFocusTrap — restaurar foco al cerrar", () => {
  it("restaura el foco al elemento previamente enfocado", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      const [active, setActive] = useState(false);
      useFocusTrap({ containerRef, active });
      return (
        <div>
          <button type="button" onClick={() => setActive(true)}>
            Abrir
          </button>
          {active && (
            <div ref={containerRef} tabIndex={-1}>
              <button type="button" onClick={() => setActive(false)}>
                Cerrar
              </button>
            </div>
          )}
        </div>
      );
    }
    render(<Wrapper />);
    const trigger = screen.getByRole("button", { name: "Abrir" });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(trigger).toHaveFocus();
  });

  it("returnFocusRef gana sobre el elemento previamente enfocado", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      const returnFocusRef = useRef<HTMLButtonElement>(null);
      const [active, setActive] = useState(false);
      useFocusTrap({ containerRef, active, returnFocusRef });
      return (
        <div>
          <button type="button" onClick={() => setActive(true)}>
            Abrir (no es el return target)
          </button>
          <button type="button" ref={returnFocusRef}>
            Return target
          </button>
          {active && (
            <div ref={containerRef} tabIndex={-1}>
              <button type="button" onClick={() => setActive(false)}>
                Cerrar
              </button>
            </div>
          )}
        </div>
      );
    }
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Abrir (no es el return target)" }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("button", { name: "Return target" })).toHaveFocus();
  });

  it("no crashea si el elemento previamente enfocado ya no existe en el DOM", async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const containerRef = useRef<HTMLDivElement>(null);
      const [showTrigger, setShowTrigger] = useState(true);
      const [active, setActive] = useState(false);
      useFocusTrap({ containerRef, active });
      return (
        <div>
          {showTrigger && (
            <button
              type="button"
              onClick={() => {
                setActive(true);
              }}
            >
              Abrir
            </button>
          )}
          {active && (
            <div ref={containerRef} tabIndex={-1}>
              <button
                type="button"
                onClick={() => {
                  setShowTrigger(false); // el trigger se desmonta ANTES de cerrar
                  setActive(false);
                }}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      );
    }
    render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(() => {}).not.toThrow(); // sanity
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    // No debe tirar -- si llegamos acá sin excepción, pasa.
    expect(screen.queryByRole("button", { name: "Abrir" })).not.toBeInTheDocument();
  });
});

describe("useFocusTrap — overlays anidados", () => {
  it("solo el overlay superior (escapeDisabled=false) responde a Escape", async () => {
    const user = userEvent.setup();
    const outerEscape = vi.fn();
    const innerEscape = vi.fn();

    function Nested() {
      const outerRef = useRef<HTMLDivElement>(null);
      const innerRef = useRef<HTMLDivElement>(null);
      // El overlay externo queda con escapeDisabled=true mientras el
      // interno está abierto -- mismo mecanismo real que
      // Z1DrilldownModal -> Modal `escapeDisabled` + App.tsx
      // `detailPanelOpen`.
      useFocusTrap({ containerRef: outerRef, active: true, onEscape: outerEscape, escapeDisabled: true });
      useFocusTrap({ containerRef: innerRef, active: true, onEscape: innerEscape });
      return (
        <div ref={outerRef} tabIndex={-1} data-testid="outer">
          <button type="button">Outer button</button>
          <div ref={innerRef} tabIndex={-1} data-testid="inner">
            <button type="button">Inner button</button>
          </div>
        </div>
      );
    }
    render(<Nested />);
    await user.keyboard("{Escape}");
    expect(innerEscape).toHaveBeenCalledOnce();
    expect(outerEscape).not.toHaveBeenCalled();
  });

  it("cerrar el overlay superior no cierra el inferior, y el foco vuelve al contexto correcto", async () => {
    const user = userEvent.setup();
    function Nested() {
      const outerRef = useRef<HTMLDivElement>(null);
      const innerTriggerRef = useRef<HTMLButtonElement>(null);
      const innerRef = useRef<HTMLDivElement>(null);
      const [innerOpen, setInnerOpen] = useState(false);

      useFocusTrap({ containerRef: outerRef, active: true, escapeDisabled: innerOpen });
      useFocusTrap({
        containerRef: innerRef,
        active: innerOpen,
        onEscape: () => setInnerOpen(false),
      });

      return (
        <div ref={outerRef} tabIndex={-1} data-testid="outer">
          <button type="button" ref={innerTriggerRef} onClick={() => setInnerOpen(true)}>
            Abrir inner (Z1 box)
          </button>
          {innerOpen && (
            <div ref={innerRef} tabIndex={-1} data-testid="inner">
              <button type="button">Inner content</button>
            </div>
          )}
        </div>
      );
    }
    render(<Nested />);
    const trigger = screen.getByRole("button", { name: "Abrir inner (Z1 box)" });
    await user.click(trigger);
    expect(screen.getByTestId("inner")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("inner")).not.toBeInTheDocument();
    expect(screen.getByTestId("outer")).toBeInTheDocument();
    // El foco vuelve al trigger que abrió el inner -- "volver al box Z1
    // que abrió el flujo".
    expect(trigger).toHaveFocus();
  });
});
