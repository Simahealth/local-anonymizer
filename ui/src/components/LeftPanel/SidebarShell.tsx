/**
 * Collapsible sidebar shell -- `.aow-sidebar` + brand (logo + collapse/
 * expand toggle) + scrollable `.sidebar-body`. Extracted from
 * LeftPanel.tsx (2026-09-12, when HospitalWorkspace needed its own left
 * sidebar with the exact same collapse behavior) so both actors share
 * one real implementation instead of a second copy of the collapse
 * state/toggle markup -- LeftPanel.tsx itself was refactored to render
 * through this, not just visually match it.
 *
 * Knows nothing about what's inside it (Intents, Papelera, tool-panel,
 * account chip for LeftPanel; "Base de datos"/"Proyectos" for
 * HospitalWorkspace) -- `children` renders inside `.sidebar-body`,
 * right after the brand, same position every consumer already used it.
 *
 * design/react-visual-align (collapsed chevron, ported verbatim from
 * LeftPanel.tsx): the toggle lives inside `.sidebar-brand` (not a
 * sibling) -- expanded, it renders as the original top-right ghost
 * icon-button ("«"); collapsed, CSS covers the whole `.sidebar-brand`
 * box with it (invisible until hover) so the chevron never sits fixed
 * on top of the logo glyph -- see left-panel.css's
 * `.aow-sidebar--collapsed .sidebar-brand .sidebar-toggle`.
 */
import { useState } from "react";
import { SimaLogo } from "./SimaLogo";
import { getIconGlyph } from "../../styles/ds/foundations/icons/icons";

export interface SidebarShellProps {
  ariaLabel: string;
  children: React.ReactNode;
}

export function SidebarShell({ ariaLabel, children }: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={"aow-sidebar" + (collapsed ? " aow-sidebar--collapsed" : "")}
      data-sidebar
      aria-label={ariaLabel}
    >
      <div className="sidebar-body">
        <div className="sidebar-brand">
          <SimaLogo collapsed={collapsed} />
          <button
            type="button"
            className={"sidebar-toggle" + (collapsed ? " btn btn--primary" : "")}
            aria-label={collapsed ? "Expandir panel" : "Colapsar panel"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <span className="material-symbols-outlined" aria-hidden="true">
                {getIconGlyph("chevron_right")}
              </span>
            ) : (
              <span className="sidebar-toggle__icon" aria-hidden="true">
                «
              </span>
            )}
          </button>
        </div>

        {children}
      </div>
    </aside>
  );
}
