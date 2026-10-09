/**
 * DS Button atom — contract tests.
 *
 * Structural (source-text) assertions, not computed-style ones: this
 * project's Vitest config doesn't enable CSS processing (`test.css` is
 * unset, default `false`), so a bare `.css` import is a no-op in jsdom
 * -- `getComputedStyle` never reflects these rules in this test
 * environment (verified directly: importing `button.css` and reading
 * `getComputedStyle(button)` returns browser-default initial values,
 * not this file's declarations). Real visual verification happens live
 * in-browser (see PR/session notes); these tests instead pin the
 * actual CSS source, which is exactly as reliable for catching a
 * regression in this file and doesn't depend on jsdom's CSS engine.
 *
 * 2026-08-25 fix under test: `.btn--subtle` (Ghost) had no
 * `--btn-*-disabled` token overrides, so a disabled Ghost button fell
 * back to `.btn`'s base (Primary) disabled tokens -- filled
 * `--surface-tertiary` background + `--border-subtle` border, breaking
 * Ghost's "never fill, never border" identity exactly when disabled.
 */
/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// `@types/node` isn't in this project's tsconfig `types` array (a
// browser-only app) but IS installed -- the triple-slash reference
// above pulls in Node's ambient types for this one test file only,
// without changing the shared tsconfig.
const css = readFileSync(
  path.resolve(process.cwd(), "src/styles/ds/atoms/button/button.css"),
  "utf-8",
);

/** Extracts the `{ ... }` body of a single, simple (non-comma) selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.[\]="]/g, (c) => `\\${c}`);
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"));
  if (!match) throw new Error(`Rule not found in button.css: ${selector}`);
  return match[1]!;
}

describe("DS Button atom (button.css) — .btn--subtle (Ghost)", () => {
  it("rest: transparent background and border -- never the filled Primary look", () => {
    const body = ruleBody(".btn--subtle");
    expect(body).toMatch(/--btn-bg:\s*transparent\s*;/);
    expect(body).toMatch(/--btn-border:\s*transparent\s*;/);
  });

  it("hover: stays transparent (bg/border) -- only the text/icon color shifts to brand", () => {
    const body = ruleBody(".btn--subtle");
    expect(body).toMatch(/--btn-bg-hover:\s*transparent\s*;/);
    expect(body).toMatch(/--btn-border-hover:\s*transparent\s*;/);
    expect(body).toMatch(/--btn-text-hover:\s*var\(--text-brand/);
  });

  it("disabled: stays Ghost -- transparent background, transparent border, --text-disabled color (the bug this fixes)", () => {
    const body = ruleBody(".btn--subtle");
    expect(body).toMatch(/--btn-bg-disabled:\s*transparent\s*;/);
    expect(body).toMatch(/--btn-border-disabled:\s*transparent\s*;/);
    expect(body).toMatch(/--btn-text-disabled:\s*var\(--text-disabled/);
  });

  it("disabled Ghost does NOT fall back to any Primary/filled disabled value", () => {
    const body = ruleBody(".btn--subtle");
    // The base .btn disabled tokens Ghost must never inherit unset:
    expect(body).not.toMatch(/--btn-bg-disabled:\s*var\(--surface-tertiary/);
    expect(body).not.toMatch(/--btn-border-disabled:\s*var\(--border-subtle/);
  });

  it("no --btn-*-disabled token is left for Ghost to inherit from .btn's base (every one it reads is overridden)", () => {
    // .btn:disabled reads exactly these three custom properties -- if
    // .btn--subtle doesn't override all three, at least one silently
    // falls back to Primary's disabled look.
    const body = ruleBody(".btn--subtle");
    for (const token of ["--btn-bg-disabled", "--btn-border-disabled", "--btn-text-disabled"]) {
      expect(body).toContain(`${token}:`);
    }
  });

  it("no new component tokens were introduced -- only the three that already exist on .btn's base", () => {
    const base = ruleBody(".btn");
    const subtle = ruleBody(".btn--subtle");
    const subtleTokens = [...subtle.matchAll(/(--btn-[a-z-]+):/g)].map((m) => m[1]);
    for (const token of subtleTokens) {
      expect(base).toContain(`${token}:`);
    }
  });
});

describe("DS Button atom (button.css) — disabled is a cross-cutting state, not variant-destroying", () => {
  it(".btn:hover/:active are guarded by :not(:disabled):not([aria-disabled]) at the base level -- applies to every variant, Ghost included, unmodified by this fix", () => {
    expect(css).toContain('.btn:hover:not(:disabled):not([aria-disabled="true"]) {');
    expect(css).toContain('.btn:active:not(:disabled):not([aria-disabled="true"]) {');
  });

  it(".btn:disabled sets not-allowed cursor and disables pointer interaction for every variant", () => {
    const body = ruleBody(".btn:disabled,\n.btn[aria-disabled=\"true\"]");
    expect(body).toMatch(/cursor:\s*not-allowed\s*;/);
    expect(body).toMatch(/pointer-events:\s*none\s*;/);
  });

  it("Primary's own disabled anatomy is untouched -- disabled Primary still uses the base filled tokens, this fix only added an override for Ghost", () => {
    const primary = ruleBody(".btn--primary");
    // Primary declares no overrides of its own (inherits .btn's base
    // disabled tokens verbatim, as documented) -- confirms this change
    // didn't touch Primary at all.
    expect(primary).not.toMatch(/--btn-bg-disabled/);
    expect(primary).not.toMatch(/--btn-border-disabled/);
    expect(primary).not.toMatch(/--btn-text-disabled/);
  });
});
