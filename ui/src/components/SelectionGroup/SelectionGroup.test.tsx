import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionGroup } from "./SelectionGroup";

const ITEMS = [
  { value: "todas", label: "Todas", active: true },
  { value: "critica", label: "Crítica" },
  { value: "proxima", label: "Próxima" },
];

describe("SelectionGroup", () => {
  it("renders the same classes/attributes as the DS molecule", () => {
    render(
      <SelectionGroup
        label="Ventana terapéutica"
        sgKey="ventana"
        mode="single"
        items={ITEMS}
        onChange={vi.fn()}
      />,
    );
    const group = screen.getByRole("group", { name: "Ventana terapéutica" });
    expect(group).toHaveClass("selection-group");
    expect(group).toHaveAttribute("data-mode", "single");
    expect(group).toHaveAttribute("data-size", "sm");
    expect(group).toHaveAttribute("data-sg-key", "ventana");

    const items = screen.getAllByRole("button");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveClass("selection-group__item");
    expect(items[0]).toHaveAttribute("aria-pressed", "true");
    expect(items[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("roving tabindex: only the active item is a tab stop", () => {
    render(
      <SelectionGroup
        label="Ventana"
        sgKey="ventana"
        items={ITEMS}
        onChange={vi.fn()}
      />,
    );
    const items = screen.getAllByRole("button");
    expect(items[0]).toHaveAttribute("tabIndex", "0");
    expect(items[1]).toHaveAttribute("tabIndex", "-1");
    expect(items[2]).toHaveAttribute("tabIndex", "-1");
  });

  it("single mode: clicking an item reports it as the sole active value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectionGroup
        label="Ventana"
        sgKey="ventana"
        mode="single"
        items={ITEMS}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Crítica" }));
    expect(onChange).toHaveBeenCalledWith("critica", ["critica"]);
  });

  it("multiple mode: toggling accumulates/removes from the active values", async () => {
    // Z3 responsable filter, canon-alignment task: this molecule's own
    // unit test used "mis-casos"/"sin-titular" as example values,
    // borrowed from a real Z3 filter that has since dropped
    // "sin-titular" as a product option -- switched to neutral,
    // domain-free example values so this test can't be misread as
    // asserting anything about that filter's own semantics (it only
    // exercises SelectionGroup's own generic multi-select toggle
    // mechanics, unrelated to any real filter option).
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = [
      { value: "opcion-a", label: "Opción A", active: true },
      { value: "opcion-b", label: "Opción B" },
    ];
    render(
      <SelectionGroup
        label="Grupo"
        sgKey="grupo"
        mode="multiple"
        items={items}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Opción B" }));
    expect(onChange).toHaveBeenCalledWith("opcion-b", [
      "opcion-a",
      "opcion-b",
    ]);
  });

  it("arrow keys move the roving tab stop without changing selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectionGroup
        label="Ventana"
        sgKey="ventana"
        items={ITEMS}
        onChange={onChange}
      />,
    );
    const items = screen.getAllByRole("button");
    items[0]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute("tabIndex", "0");
    expect(items[0]).toHaveAttribute("tabIndex", "-1");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hideLabel (chat 2026-09-27, 'abreviatura como tag seleccionable'): skips the built-in label span but keeps the group's accessible name", () => {
    render(
      <SelectionGroup
        label="Tratamiento"
        sgKey="honorific"
        mode="single"
        items={ITEMS}
        onChange={vi.fn()}
        hideLabel
      />,
    );
    expect(screen.queryByText("Tratamiento")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tratamiento" })).toBeInTheDocument();
  });

  it("renders a hidden item with the native hidden attribute", () => {
    const items = [
      { value: "a", label: "A", active: true },
      { value: "b", label: "B", hidden: true },
    ];
    const { container } = render(
      <SelectionGroup
        label="Titular"
        sgKey="titular"
        mode="multiple"
        items={items}
        more={{ label: "Ver más" }}
        onChange={vi.fn()}
      />,
    );
    const hiddenItem = container.querySelector('[data-sg-value="b"]');
    expect(hiddenItem).toHaveAttribute("hidden");
    expect(
      screen.getByRole("button", { name: "Ver más" }),
    ).toHaveClass("sidebar-z3-group-more");
  });
});
