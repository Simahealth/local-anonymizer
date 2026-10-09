import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children as a non-interactive span", () => {
    render(<Badge>Validado</Badge>);
    const el = screen.getByText("Validado");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveClass("badge", "badge--neutral");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies each tone class", () => {
    const { rerender } = render(<Badge tone="success">Validado</Badge>);
    expect(screen.getByText("Validado")).toHaveClass("badge--success");

    rerender(<Badge tone="warning">Pendiente</Badge>);
    expect(screen.getByText("Pendiente")).toHaveClass("badge--warning");

    rerender(<Badge tone="error">Falló</Badge>);
    expect(screen.getByText("Falló")).toHaveClass("badge--error");

    rerender(<Badge tone="info">En análisis</Badge>);
    expect(screen.getByText("En análisis")).toHaveClass("badge--info");

    rerender(<Badge tone="neutral">En cola</Badge>);
    expect(screen.getByText("En cola")).toHaveClass("badge--neutral");
  });

  it("applies size classes -- md (default) has no size modifier, sm does", () => {
    const { rerender } = render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).not.toHaveClass("badge--sm");

    rerender(<Badge size="sm">Chico</Badge>);
    expect(screen.getByText("Chico")).toHaveClass("badge--sm");
  });

  it("renders an optional icon from the Icon Registry, hidden from AT", () => {
    render(<Badge icon="check_circle">Validado</Badge>);
    const icon = screen.getByText("Validado").querySelector(".badge__icon");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.querySelector(".material-symbols-outlined")).toHaveTextContent("check_circle");
  });

  it("without an icon, renders no icon slot", () => {
    render(<Badge>Sin ícono</Badge>);
    expect(screen.getByText("Sin ícono").querySelector(".badge__icon")).not.toBeInTheDocument();
  });

  it("merges a consumer className alongside the generated classes", () => {
    render(<Badge className="custom-class">Texto</Badge>);
    expect(screen.getByText("Texto")).toHaveClass("badge", "badge--neutral", "custom-class");
  });
});
