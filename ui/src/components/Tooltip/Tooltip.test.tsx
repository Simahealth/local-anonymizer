import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "./Tooltip";

function mockRect(el: Element, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
}

describe("Tooltip", () => {
  it("renders the trigger and the tooltip content, wired via aria-describedby/role=tooltip", () => {
    render(
      <Tooltip content="Abrir documento">
        <button>Ver</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Ver" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    expect(tooltip).toHaveTextContent("Abrir documento");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("stays hidden until hover, then hides again on mouse leave", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Abrir documento">
        <button>Ver</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Ver" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).not.toHaveClass("tooltip--visible");

    await user.hover(trigger);
    expect(tooltip).toHaveClass("tooltip--visible");

    await user.unhover(trigger);
    expect(tooltip).not.toHaveClass("tooltip--visible");
  });

  it("shows on keyboard focus and hides on blur", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Abrir documento">
          <button>Ver</button>
        </Tooltip>
        <button>Otro</button>
      </>,
    );

    const trigger = screen.getByRole("button", { name: "Ver" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(tooltip).toHaveClass("tooltip--visible");

    await user.tab();
    expect(tooltip).not.toHaveClass("tooltip--visible");
  });

  it("preserves the trigger's own hover/focus handlers instead of replacing them", async () => {
    const user = userEvent.setup();
    let hoverCalls = 0;
    render(
      <Tooltip content="Abrir documento">
        <button onMouseEnter={() => hoverCalls++}>Ver</button>
      </Tooltip>,
    );

    await user.hover(screen.getByRole("button", { name: "Ver" }));
    expect(hoverCalls).toBe(1);
  });

  it("supports non-button triggers (e.g. a div-based custom trigger)", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Resumen completo">
        <div role="button" tabIndex={0}>
          Texto truncado
        </div>
      </Tooltip>,
    );

    const trigger = screen.getByText("Texto truncado");
    const tooltip = screen.getByRole("tooltip", { hidden: true });

    await user.hover(trigger);
    expect(tooltip).toHaveClass("tooltip--visible");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("renders the floating layer in a portal on document.body, escaping any ancestor with overflow:hidden", () => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <Tooltip content="Abrir documento">
          <button>Ver</button>
        </Tooltip>
      </div>,
    );

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip.parentElement).toBe(document.body);
    expect(container.contains(tooltip)).toBe(false);
  });

  it("positions with `position: fixed`, centered above the trigger by default", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Abrir documento">
        <button>Ver</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Ver" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    // `position` (and its `fixed` value) come from the CSS class, not
    // inline style -- what this component computes and applies inline
    // is `top`/`left`, measured off the wrapper span (what `wrapperRef`
    // points at), not the trigger element itself.
    mockRect(trigger.parentElement!, { top: 100, left: 5, right: 45, bottom: 120, width: 40, height: 20 });
    mockRect(tooltip, { width: 200, height: 30 });

    await user.hover(trigger);

    // Centered: left + width/2 - tooltipWidth/2 = 5 + 20 - 100 = -75,
    // clamped to the viewport-margin floor (mirrors --space-12).
    expect(tooltip.style.left).toBe("12px");
    // Fits above (spaceAbove = 100 - GAP(8) - MARGIN(12) = 80 >= 30):
    // top = triggerTop - tooltipHeight - GAP = 100 - 30 - 8 = 62.
    expect(tooltip.style.top).toBe("62px");
  });

  it("flips below the trigger when there isn't enough room above (near the top of the viewport)", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Abrir documento">
        <button>Ver</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Ver" });
    const tooltip = screen.getByRole("tooltip", { hidden: true });
    mockRect(trigger.parentElement!, { top: 5, left: 100, right: 140, bottom: 25, width: 40, height: 20 });
    mockRect(tooltip, { width: 200, height: 30 });

    await user.hover(trigger);

    // spaceAbove = 5 - 8 - 12 = -15, doesn't fit -> renders below:
    // top = triggerBottom + GAP = 25 + 8 = 33.
    expect(tooltip.style.top).toBe("33px");
  });

  it("clamps against the right edge of the viewport instead of letting the tooltip overflow it", async () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 300 });
    try {
      const user = userEvent.setup();
      render(
        <Tooltip content="Abrir documento" align="end">
          <button>Ver</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole("button", { name: "Ver" });
      const tooltip = screen.getByRole("tooltip", { hidden: true });
      // align="end" would put the tooltip's right edge at the trigger's
      // right edge (290), pushing its left edge to 90 -- past what fits
      // in a 300px-wide viewport with a 200px-wide tooltip.
      mockRect(trigger.parentElement!, { top: 100, left: 270, right: 290, bottom: 120, width: 20, height: 20 });
      mockRect(tooltip, { width: 200, height: 30 });

      await user.hover(trigger);

      // maxLeft = innerWidth - tooltipWidth - MARGIN = 300 - 200 - 12 = 88.
      expect(tooltip.style.left).toBe("88px");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
    }
  });
});
