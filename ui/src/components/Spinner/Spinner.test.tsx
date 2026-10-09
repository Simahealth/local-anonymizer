import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "./Spinner";

describe("Spinner", () => {
  it("renders the progress_activity icon from the Icon Registry, with no inline SVG", () => {
    render(<Spinner label="Cargando" />);
    const el = screen.getByRole("status", { name: "Cargando" });
    const icon = el.querySelector(".material-symbols-outlined");
    expect(icon).toHaveTextContent("progress_activity");
    expect(el.querySelector("svg")).not.toBeInTheDocument();
  });

  it("size generates the correct class -- md is the default", () => {
    const { rerender, container } = render(<Spinner />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--md");

    rerender(<Spinner size="xs" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--xs");

    rerender(<Spinner size="sm" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--sm");

    rerender(<Spinner size="lg" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--lg");
  });

  it("tone generates the correct class -- neutral is the default", () => {
    const { rerender, container } = render(<Spinner />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--neutral");

    rerender(<Spinner tone="brand" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--brand");

    rerender(<Spinner tone="inverse" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner--inverse");
  });

  it("with a label, exposes an accessible name via role=status + aria-label", () => {
    render(<Spinner label="Cargando casos" />);
    const el = screen.getByRole("status", { name: "Cargando casos" });
    expect(el).not.toHaveAttribute("aria-hidden");
  });

  it("without a label, is purely decorative (aria-hidden, no accessible role)", () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector(".spinner")!;
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).not.toHaveAttribute("role");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("merges a consumer className alongside the generated classes", () => {
    const { container } = render(<Spinner className="custom-class" />);
    expect(container.querySelector(".spinner")).toHaveClass("spinner", "spinner--md", "spinner--neutral", "custom-class");
  });
});
