import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ToastOptions } from "./types";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./useToast";

/** Scoped al viewport visual -- evita ambigüedad con la LiveRegion, que
 * comparte el mismo texto (el mensaje se anuncia Y se muestra). */
function viewport() {
  return within(document.querySelector(".toast-viewport")! as Element as HTMLElement);
}
function queryToastMessage(text: string) {
  const el = document.querySelector(".toast-viewport");
  return el ? within(el as HTMLElement).queryByText(text) : null;
}

function Trigger({ options, label = "Disparar" }: { options: ToastOptions; label?: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      {label}
    </button>
  );
}

function DismissButton({ id }: { id: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.dismiss(id)}>
      Dismiss {id}
    </button>
  );
}

function AnnounceButton({ message }: { message: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.announce(message)}>
      Announce
    </button>
  );
}

describe("ToastProvider — render básico", () => {
  it("renderiza el viewport (vacío) y la live region, sin toasts al montar", () => {
    render(<ToastProvider>contenido</ToastProvider>);
    expect(screen.getByText("contenido")).toBeInTheDocument();
    expect(document.querySelector(".toast-viewport")).not.toBeInTheDocument(); // vacío -> no renderiza el viewport
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(2); // polite + assertive, persistentes
  });

  it("useToast fuera de un ToastProvider tira un error explícito", () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});

describe("ToastProvider — toast.show() crea toast visual y anuncia", () => {
  it("crea un toast visual con el mensaje", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Acción registrada." }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    expect(viewport().getByText("Acción registrada.")).toBeInTheDocument();
    expect(document.querySelector(".toast-viewport")).toBeInTheDocument();
  });

  it("anuncia el mensaje en la live region (polite por default)", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Caso actualizado." }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    const politeRegion = document.querySelector('[aria-live="polite"]')!;
    await waitFor(() => expect(politeRegion).toHaveTextContent("Caso actualizado."));
  });

  it("tone=\"error\" sin politeness explícito anuncia en la región assertive", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Falló la operación.", tone: "error" }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    const assertiveRegion = document.querySelector('[aria-live="assertive"]')!;
    await waitFor(() => expect(assertiveRegion).toHaveTextContent("Falló la operación."));
  });
});

describe("ToastProvider — tonos: clase e ícono correctos", () => {
  it.each([
    ["success", "check_circle"],
    ["warning", "warning"],
    ["error", "error"],
    ["info", "info"],
  ] as const)("tone=%s renderiza .toast--%s y el ícono %s", async (tone, icon) => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Mensaje", tone }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    const toastEl = document.querySelector(`.toast--${tone}`);
    expect(toastEl).toBeInTheDocument();
    expect(toastEl!.querySelector(".toast__icon .material-symbols-outlined")).toHaveTextContent(icon);
  });

  it("tone=\"neutral\" (default) no renderiza ícono", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Mensaje genérico" }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    const toastEl = document.querySelector(".toast--neutral")!;
    expect(toastEl.querySelector(".toast__icon")).not.toBeInTheDocument();
  });
});

describe("ToastProvider — auto-dismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("se auto-cierra después de la duración default (~4.5s)", async () => {
    // fireEvent, no userEvent: userEvent.click() + vi.useFakeTimers()
    // cuelga indefinidamente en esta combinación vitest 4/user-event 14
    // (confirmado con un repro mínimo sin nada de Toast de por medio) --
    // fireEvent es síncrono, no depende de los timers para resolver su
    // propia promesa interna.
    render(
      <ToastProvider>
        <Trigger options={{ message: "Se cierra solo" }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disparar" }));
    expect(viewport().getByText("Se cierra solo")).toBeInTheDocument();

    vi.advanceTimersByTime(4500);
    vi.advanceTimersByTime(400); // fallback de salida (transitionend no dispara en jsdom)
    await vi.waitFor(() => expect(queryToastMessage("Se cierra solo")).not.toBeInTheDocument());
  });

  it("error con action NO se auto-cierra (requiere cierre manual)", () => {
    render(
      <ToastProvider>
        <Trigger
          options={{
            message: "Falló, reintentar?",
            tone: "error",
            action: { label: "Reintentar", onClick: vi.fn() },
          }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disparar" }));
    vi.advanceTimersByTime(20000);
    expect(viewport().getByText("Falló, reintentar?")).toBeInTheDocument();
  });
});

describe("ToastProvider — hover/focus pausan el auto-dismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hover pausa el timer; sin ese hover, se habría cerrado", async () => {
    render(
      <ToastProvider>
        <Trigger options={{ message: "Pausable" }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Disparar" }));
    const toastEl = document.querySelector(".toast")!;

    vi.advanceTimersByTime(3000);
    toastEl.dispatchEvent(new Event("mouseenter", { bubbles: true }));
    vi.advanceTimersByTime(4000); // ya habría pasado el default de 4500ms si no estuviera pausado
    expect(viewport().getByText("Pausable")).toBeInTheDocument();

    toastEl.dispatchEvent(new Event("mouseleave", { bubbles: true }));
    vi.advanceTimersByTime(1500 + 400); // el remaining (~1500ms) + fallback de salida
    await vi.waitFor(() => expect(queryToastMessage("Pausable")).not.toBeInTheDocument());
  });
});

describe("ToastProvider — dismiss manual", () => {
  it("el botón de cerrar quita el toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Cerrable" }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    await user.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    await waitFor(() => expect(queryToastMessage("Cerrable")).not.toBeInTheDocument());
  });

  it("dismissible=false no renderiza botón de cerrar", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Sin cerrar", dismissible: false }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    expect(screen.queryByRole("button", { name: "Cerrar notificación" })).not.toBeInTheDocument();
  });

  it("toast.dismiss(id) programático cierra el toast correcto", async () => {
    const user = userEvent.setup();
    function Harness() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            const id = toast.show({ id: "explicit-id", message: "Programático" });
            expect(id).toBe("explicit-id");
          }}
        >
          Show
        </button>
      );
    }
    render(
      <ToastProvider>
        <Harness />
        <DismissButton id="explicit-id" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(viewport().getByText("Programático")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss explicit-id" }));
    await waitFor(() => expect(queryToastMessage("Programático")).not.toBeInTheDocument());
  });
});

describe("ToastProvider — action button", () => {
  it("usa el componente Button DS y ejecuta el callback al hacer click", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Con acción", action: { label: "Deshacer", onClick: onAction } }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    const actionBtn = screen.getByRole("button", { name: "Deshacer" });
    expect(actionBtn).toHaveClass("btn"); // Button DS real, no un <button> ad-hoc
    await user.click(actionBtn);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("hacer click en la acción también cierra el toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Con acción", action: { label: "Deshacer", onClick: vi.fn() } }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    await user.click(screen.getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(queryToastMessage("Con acción")).not.toBeInTheDocument());
  });
});

describe("ToastProvider — Escape cierra el toast enfocado", () => {
  it("Escape con foco dentro del toast lo cierra", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Enfocable" }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    screen.getByRole("button", { name: "Cerrar notificación" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(queryToastMessage("Enfocable")).not.toBeInTheDocument());
  });
});

describe("ToastProvider — máximo visible", () => {
  it("respeta el límite (default 3): el 4to descarta al más viejo", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Uno" }} label="1" />
        <Trigger options={{ message: "Dos" }} label="2" />
        <Trigger options={{ message: "Tres" }} label="3" />
        <Trigger options={{ message: "Cuatro" }} label="4" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    await user.click(screen.getByRole("button", { name: "3" }));
    await user.click(screen.getByRole("button", { name: "4" }));

    expect(queryToastMessage("Uno")).not.toBeInTheDocument();
    expect(viewport().getByText("Dos")).toBeInTheDocument();
    expect(viewport().getByText("Tres")).toBeInTheDocument();
    expect(viewport().getByText("Cuatro")).toBeInTheDocument();
  });

  it("maxVisible es configurable", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider maxVisible={1}>
        <Trigger options={{ message: "Uno" }} label="1" />
        <Trigger options={{ message: "Dos" }} label="2" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(queryToastMessage("Uno")).not.toBeInTheDocument();
    expect(viewport().getByText("Dos")).toBeInTheDocument();
  });
});

describe("ToastProvider — dedupe", () => {
  it("mismo tone+message ya visible: no crea un segundo toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger options={{ message: "Repetido" }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    await user.click(screen.getByRole("button", { name: "Disparar" }));
    expect(viewport().getAllByText("Repetido")).toHaveLength(1);
  });

  describe("refresca la duración (timers falsos, con cleanup garantizado)", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("refresca la duración del existente en vez de ignorar el segundo show()", () => {
      render(
        <ToastProvider>
          <Trigger options={{ message: "Repetido con refresh" }} />
        </ToastProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Disparar" }));
      vi.advanceTimersByTime(4000); // dentro de los 4500ms default
      fireEvent.click(screen.getByRole("button", { name: "Disparar" })); // debería reiniciar el timer
      vi.advanceTimersByTime(4000); // si NO se hubiera refrescado, ya habría cerrado hace rato
      expect(viewport().getByText("Repetido con refresh")).toBeInTheDocument();
    });
  });
});

describe("ToastProvider — announce() sin toast visual", () => {
  it("anuncia en la live region sin renderizar ningún toast", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AnnounceButton message="Detalle abierto: Caso X" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Announce" }));
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("Detalle abierto: Caso X"),
    );
    expect(document.querySelector(".toast-viewport")).not.toBeInTheDocument();
  });
});

describe("ToastProvider — reduced motion no rompe estados", () => {
  it("con matchMedia(prefers-reduced-motion) simulado, el toast sigue apareciendo y pudiendo cerrarse", async () => {
    const originalMatchMedia = window.matchMedia;
    // @ts-expect-error -- stub mínimo, no todos los métodos de MediaQueryList
    window.matchMedia = (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    try {
      const user = userEvent.setup();
      render(
        <ToastProvider>
          <Trigger options={{ message: "Con reduced motion" }} />
        </ToastProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Disparar" }));
      expect(viewport().getByText("Con reduced motion")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cerrar notificación" }));
      await waitFor(() => expect(queryToastMessage("Con reduced motion")).not.toBeInTheDocument());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
