import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  render(
    <Modal open={true} title="Título de prueba" onClose={onClose} {...props}>
      <button type="button">Acción interna</button>
    </Modal>,
  );
  return { onClose };
}

describe("Modal", () => {
  it("closed: not rendered in the document", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("open: renders as an accessible dialog labelled by its title, with children", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Título de prueba" })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName("Título de prueba");
    expect(screen.getByRole("button", { name: "Acción interna" })).toBeInTheDocument();
  });

  // DetailPanel QA visual fixes task, item 2: `.modal-overlay` must be a
  // portal to `document.body`, NOT a descendant of wherever `Modal` was
  // mounted -- an ancestor with a `transform` (e.g. DetailPanel's own
  // `.panel-overlay` slide-in drawer) creates a new containing block for
  // `position: fixed`, which would silently center/clip the modal to
  // that ancestor's box instead of the real viewport. Rendered inside a
  // transformed wrapper here, same shape as the real bug.
  it("portals .modal-overlay to document.body, escaping any transformed ancestor (viewport-global, not clipped to the mount point)", () => {
    const { container } = render(
      <div style={{ transform: "translateX(0)" }} data-testid="transformed-ancestor">
        <Modal open title="Título" onClose={vi.fn()}>
          <button type="button">Campo</button>
        </Modal>
      </div>,
    );
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    expect(overlay).toBeInTheDocument();
    expect(overlay.parentElement).toBe(document.body);
    expect(container.querySelector(".modal-overlay")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="transformed-ancestor"] .modal-overlay')).toBeNull();
  });

  // chat 2026-09-27: a consumer that needs to override something on the
  // portaled overlay itself (e.g. z-index, see Z1DrilldownModal.tsx)
  // used to wrap `<Modal>` in its own `<div className="...">` and scope
  // a CSS descendant selector to it -- broken by construction, since the
  // portal above means that wrapper is never `.modal-overlay`'s real DOM
  // ancestor. `overlayClassName` is the only way to actually reach it.
  it("overlayClassName lands on the portaled .modal-overlay itself, not a wrapper", () => {
    render(
      <Modal open title="Título" onClose={vi.fn()} overlayClassName="custom-overlay-class">
        <button type="button">Campo</button>
      </Modal>,
    );
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    expect(overlay).toHaveClass("modal-overlay", "open", "custom-overlay-class");
    expect(overlay.parentElement).toBe(document.body);
  });

  // DetailPanel QA visual fixes task: a second `Modal` nested inside the
  // first's `children` (e.g. UserSettingsModal's own sign-out
  // confirmation) always mounts its OWN `.modal-overlay` from the start
  // (even closed, for the opacity transition) -- since both portal to
  // the same `document.body`, without reordering-on-open the nested one
  // could land BEFORE the outer one in DOM order (React's commit order
  // for the initial mount, not "opened later"), which would paint it
  // BEHIND the outer modal despite opening on top of it, and break any
  // "last in DOM = topmost/most relevant" query (a pattern this test
  // suite itself uses in several places).
  it("re-parents to the end of document.body every time it opens, so a modal opened later always lands after one opened earlier in DOM order", () => {
    function Nested({ innerOpen }: { innerOpen: boolean }) {
      return (
        <Modal open title="Outer" onClose={vi.fn()}>
          <Modal open={innerOpen} title="Inner" onClose={vi.fn()}>
            <button type="button">Acción interna</button>
          </Modal>
        </Modal>
      );
    }
    const { rerender } = render(<Nested innerOpen={false} />);
    const overlays = () => Array.from(document.body.querySelectorAll(":scope > .modal-overlay"));
    // Both mounted from the start (inner closed, just invisible) --
    // whatever their initial order, it's about to be asserted AFTER
    // the inner one opens, which is the case that matters.
    expect(overlays().length).toBe(2);

    rerender(<Nested innerOpen={true} />);
    const [first, second] = overlays();
    expect(first!.querySelector(".modal-title")).toHaveTextContent("Outer");
    expect(second!.querySelector(".modal-title")).toHaveTextContent("Inner");
  });

  it("interactive children work normally (not blocked by the chrome)", async () => {
    const user = userEvent.setup();
    const onInnerClick = vi.fn();
    render(
      <Modal open={true} title="Título" onClose={vi.fn()}>
        <button type="button" onClick={onInnerClick}>
          Acción interna
        </button>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: "Acción interna" }));
    expect(onInnerClick).toHaveBeenCalledTimes(1);
  });

  it("close button calls onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape calls onClose", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop calls onClose, clicking inside the container does not", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("heading", { name: "Título de prueba" }));
    expect(onClose).not.toHaveBeenCalled();

    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("without a footer prop, renders no .modal-footer at all", () => {
    renderModal();
    expect(document.querySelector(".modal-footer")).not.toBeInTheDocument();
  });

  it("with a footer prop, renders it pinned outside/after modal-body, not inside the scrollable body content", () => {
    renderModal({ footer: <div data-testid="footer-content">pie</div> });
    const footer = document.querySelector(".modal-footer");
    expect(footer).not.toBeNull();
    expect(footer!.querySelector('[data-testid="footer-content"]')).toBeInTheDocument();
    const body = document.querySelector(".modal-body");
    expect(body!.querySelector('[data-testid="footer-content"]')).not.toBeInTheDocument();
  });

  it("without a width prop (every existing consumer), never adds the wide-width modifier", () => {
    renderModal();
    expect(document.querySelector(".modal-container--wide")).not.toBeInTheDocument();
  });

  it("width=\"wide\" adds the opt-in modifier class, without removing the base .modal-container class", () => {
    renderModal({ width: "wide" });
    const container = document.querySelector(".modal-container");
    expect(container).toHaveClass("modal-container--wide");
  });

  it("without initialFocusRef (every existing consumer), keeps focusing the container itself on open", () => {
    renderModal();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("initialFocusRef, when passed, receives focus on open instead of the container", () => {
    function WithRef() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Modal open title="Título" onClose={vi.fn()} initialFocusRef={ref}>
          <button ref={ref} type="button">
            Campo
          </button>
        </Modal>
      );
    }
    render(<WithRef />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Campo" }));
  });

  it("without describedById (every existing consumer), renders no aria-describedby", () => {
    renderModal();
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby");
  });

  it("describedById, when passed, is wired as the dialog's aria-describedby", () => {
    render(
      <Modal open title="Título" onClose={vi.fn()} describedById="desc-1">
        <p id="desc-1">Descripción</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-describedby", "desc-1");
  });

  it("without closeDisabled (every existing consumer), Escape/backdrop/Cerrar all still close normally", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    expect(screen.getByRole("button", { name: "Cerrar" })).not.toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeDisabled blocks Escape, backdrop click, and disables the Cerrar button (but doesn't remove it)", () => {
    const { onClose } = renderModal({ closeDisabled: true });

    const closeBtn = screen.getByRole("button", { name: "Cerrar" });
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });
});
