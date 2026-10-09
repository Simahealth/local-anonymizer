import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("renders a registered icon from the Icon Registry, hidden from assistive tech, with no inline SVG", () => {
    render(<IconButton icon="close" label="Cerrar" />);
    const button = screen.getByRole("button", { name: "Cerrar" });
    const icon = button.querySelector(".material-symbols-outlined");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveTextContent("close");
    expect(button.querySelector("svg")).not.toBeInTheDocument();
  });

  it("uses label as the accessible name (aria-label), never visible text", () => {
    render(<IconButton icon="close" label="Cerrar" />);
    const button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveAttribute("aria-label", "Cerrar");
    expect(button).not.toHaveTextContent("Cerrar");
  });

  it("fires onClick", () => {
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Cerrar" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disabled blocks click and renders the real disabled attribute", () => {
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Cerrar" disabled onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading shows a spinner (progress_activity, spinning class), sets aria-busy, and blocks click", () => {
    const onClick = vi.fn();
    render(<IconButton icon="close" label="Cerrar" loading onClick={onClick} />);
    const button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    const icon = button.querySelector(".material-symbols-outlined");
    expect(icon).toHaveTextContent("progress_activity");
    expect(icon).toHaveClass("icon-btn__icon--spinning");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("size classes: md (default) has no modifier, sm/lg apply their own", () => {
    const { rerender } = render(<IconButton icon="close" label="Cerrar" />);
    let button = screen.getByRole("button", { name: "Cerrar" });
    expect(button.className.trim()).toBe("icon-btn");

    rerender(<IconButton icon="close" label="Cerrar" size="sm" />);
    button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveClass("icon-btn--sm");

    rerender(<IconButton icon="close" label="Cerrar" size="lg" />);
    button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveClass("icon-btn--lg");
  });

  it("tone classes: neutral (default) has no modifier, brand/danger apply their own", () => {
    const { rerender } = render(<IconButton icon="close" label="Cerrar" />);
    let button = screen.getByRole("button", { name: "Cerrar" });
    expect(button.className.trim()).toBe("icon-btn");

    rerender(<IconButton icon="close" label="Cerrar" tone="brand" />);
    button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveClass("icon-btn--brand");

    rerender(<IconButton icon="close" label="Cerrar" tone="danger" />);
    button = screen.getByRole("button", { name: "Cerrar" });
    expect(button).toHaveClass("icon-btn--danger");
  });

  it("defaults to type=\"button\" (never submits a form by accident)", () => {
    render(<IconButton icon="close" label="Cerrar" />);
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveAttribute("type", "button");
  });

  it("merges a consumer className alongside the generated classes (e.g. Toast's icon-btn toast__close)", () => {
    render(<IconButton icon="close" label="Cerrar notificación" className="toast__close" />);
    expect(screen.getByRole("button", { name: "Cerrar notificación" })).toHaveClass(
      "icon-btn",
      "toast__close",
    );
  });

  it("passes through native button attributes (e.g. DetailPanel's data-shell-action)", () => {
    render(<IconButton icon="close" label="Cerrar" data-shell-action="close" />);
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveAttribute(
      "data-shell-action",
      "close",
    );
  });
});
