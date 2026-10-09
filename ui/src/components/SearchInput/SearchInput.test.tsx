import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  it("renders with an accessible label (aria-label, never a visible <label>)", () => {
    render(<SearchInput label="Buscar casos" />);
    const input = screen.getByRole("searchbox", { name: "Buscar casos" });
    expect(input).toBeInTheDocument();
    expect(screen.queryByText("Buscar casos")).not.toBeInTheDocument();
  });

  it("uncontrolled: typing updates its own value and calls onChange", () => {
    const onChange = vi.fn();
    render(<SearchInput label="Buscar" onChange={onChange} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.change(input, { target: { value: "ame" } });
    expect(input).toHaveValue("ame");
    expect(onChange).toHaveBeenCalledWith("ame");
  });

  it("controlled: reflects the value prop, and typing calls onChange without changing on its own", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput label="Buscar" value="foo" onChange={onChange} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    expect(input).toHaveValue("foo");

    fireEvent.change(input, { target: { value: "foobar" } });
    expect(onChange).toHaveBeenCalledWith("foobar");
    expect(input).toHaveValue("foo"); // parent hasn't re-rendered with the new value yet

    rerender(<SearchInput label="Buscar" value="foobar" onChange={onChange} />);
    expect(input).toHaveValue("foobar");
  });

  it("defaultValue seeds the uncontrolled initial value and starts expanded", () => {
    render(<SearchInput label="Buscar" defaultValue="preexistente" />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    expect(input).toHaveValue("preexistente");
    expect(input.closest(".aow-search")).toHaveClass("aow-search--expanded");
  });

  it("expands on focus and collapses on blur when empty", () => {
    render(<SearchInput label="Buscar" />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    const wrapper = input.closest(".aow-search")!;
    expect(wrapper).not.toHaveClass("aow-search--expanded");

    fireEvent.focus(input);
    expect(wrapper).toHaveClass("aow-search--expanded");

    fireEvent.blur(input);
    expect(wrapper).not.toHaveClass("aow-search--expanded");
  });

  it("does not collapse on blur while it still has a value", () => {
    render(<SearchInput label="Buscar" defaultValue="algo" />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    const wrapper = input.closest(".aow-search")!;
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(wrapper).toHaveClass("aow-search--expanded");
  });

  it("Escape clears the value when there is text", () => {
    const onChange = vi.fn();
    render(<SearchInput label="Buscar" defaultValue="algo" onChange={onChange} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("Escape does nothing when the field is already empty", () => {
    const onClear = vi.fn();
    render(<SearchInput label="Buscar" onClear={onClear} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClear).not.toHaveBeenCalled();
  });

  it("the clear button only renders when there is a value, clears it, calls onClear, and keeps focus on the input", () => {
    const onClear = vi.fn();
    render(<SearchInput label="Buscar" defaultValue="algo" onClear={onClear} />);
    expect(screen.getByRole("button", { name: "Limpiar búsqueda" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));

    const input = screen.getByRole("searchbox", { name: "Buscar" });
    expect(input).toHaveValue("");
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

  it("without a value, renders no clear button", () => {
    render(<SearchInput label="Buscar" />);
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).not.toBeInTheDocument();
  });

  it("Enter calls onSubmit with the current value when provided", () => {
    const onSubmit = vi.fn();
    render(<SearchInput label="Buscar" defaultValue="ame 5q" onSubmit={onSubmit} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("ame 5q");
  });

  it("Enter without onSubmit does nothing special (no error, no crash)", () => {
    render(<SearchInput label="Buscar" defaultValue="ame 5q" />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    expect(() => fireEvent.keyDown(input, { key: "Enter" })).not.toThrow();
  });

  it("disabled blocks interaction on the input and the clear button", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(<SearchInput label="Buscar" defaultValue="algo" disabled onChange={onChange} onClear={onClear} />);
    const input = screen.getByRole("searchbox", { name: "Buscar" });
    expect(input).toBeDisabled();
    const clearBtn = screen.getByRole("button", { name: "Limpiar búsqueda" });
    expect(clearBtn).toBeDisabled();
  });

  it("renders the search icon from the Icon Registry, hidden from assistive tech", () => {
    render(<SearchInput label="Buscar" />);
    const icon = document.querySelector(".aow-search__icon");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon?.querySelector(".material-symbols-outlined")).toHaveTextContent("search");
  });

  it("merges a consumer className alongside the generated wrapper classes", () => {
    render(<SearchInput label="Buscar" className="custom" />);
    expect(document.querySelector(".aow-search")).toHaveClass("aow-search", "custom");
  });
});
