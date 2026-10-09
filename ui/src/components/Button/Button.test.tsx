import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button — variant/tone/size class mapping", () => {
  it("default (main, neutral tone, md) renders .btn.btn--primary, no size/tone modifier", () => {
    render(<Button>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toHaveClass("btn", "btn--primary");
    expect(btn).not.toHaveClass("btn--danger", "btn--sm", "btn--lg", "btn--icon");
  });

  it("variant=outlined -> .btn--neutral (V1 class, unrenamed)", () => {
    render(<Button variant="outlined">Cancelar</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn--neutral");
  });

  it("variant=ghost -> .btn--subtle (V1 class, unrenamed)", () => {
    render(<Button variant="ghost">Cerrar</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn--subtle");
  });

  it("tone=danger combines with the variant class (e.g. .btn--primary.btn--danger)", () => {
    render(
      <Button variant="outlined" tone="danger">
        Eliminar
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("btn--neutral", "btn--danger");
  });

  it.each([
    ["sm", "btn--sm"],
    ["lg", "btn--lg"],
  ] as const)("size=%s -> %s", (size, cls) => {
    render(<Button size={size}>Label</Button>);
    expect(screen.getByRole("button")).toHaveClass(cls);
  });

  it("size=md (default) adds no size modifier class", () => {
    render(<Button size="md">Label</Button>);
    expect(screen.getByRole("button")).not.toHaveClass("btn--sm", "btn--lg", "btn--icon");
  });

  it("forwards an extra className alongside the computed DS classes (feature-local composition)", () => {
    render(<Button className="case-page-v2__back-btn">Volver</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("btn", "btn--primary", "case-page-v2__back-btn");
  });
});

describe("Button — icon-only (size=\"icon\")", () => {
  it("renders .btn--icon and uses aria-label as the accessible name", () => {
    render(<Button size="icon" aria-label="Cerrar" iconLeft={<span>×</span>} />);
    const btn = screen.getByRole("button", { name: "Cerrar" });
    expect(btn).toHaveClass("btn--icon");
  });

  it("renders no visible text node for children when size=icon", () => {
    render(<Button size="icon" aria-label="Cerrar" iconLeft={<span>×</span>} />);
    const btn = screen.getByRole("button", { name: "Cerrar" });
    // Only the icon slot's content, never a text child alongside it.
    expect(btn.textContent).toBe("×");
  });
});

describe("Button — icons", () => {
  it("wraps iconLeft/iconRight each in their own .btn__icon slot", () => {
    render(
      <Button iconLeft={<span data-testid="left" />} iconRight={<span data-testid="right" />}>
        Continuar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: /Continuar/ });
    const icons = btn.querySelectorAll(".btn__icon");
    expect(icons).toHaveLength(2);
    expect(icons[0]?.querySelector('[data-testid="left"]')).not.toBeNull();
    expect(icons[1]?.querySelector('[data-testid="right"]')).not.toBeNull();
  });
});

describe("Button — disabled", () => {
  it("uses a real `disabled` attribute, not just aria-disabled", () => {
    render(<Button disabled>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Button — loading", () => {
  it("sets aria-busy and disables the button (blocks interaction like disabled)", () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
  });

  it("keeps the label text unchanged and swaps the icon slot for a spinner", () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn).toHaveTextContent("Guardar");
    expect(btn.querySelector(".btn__icon--spinning")).not.toBeNull();
  });

  it("does not fire onClick while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("aria-busy is absent (not \"false\") when not loading", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });
});

describe("Button — selected (individual toggle)", () => {
  it("selected=true sets aria-pressed=true", () => {
    render(<Button selected>Filtro</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("selected=false sets aria-pressed=false", () => {
    render(<Button selected={false}>Filtro</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("omitting selected omits aria-pressed entirely (not a toggle)", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });
});

describe("Button — click/keyboard", () => {
  it("fires onClick on mouse click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("fires onClick on Enter/Space via keyboard (native <button> behavior)", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("defaults to type=\"button\" (never submits a form by accident)", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("respects an explicit type=\"submit\"", () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
