// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard: the sidebar renders the one-click project scope
 * pills when `t3teamProjectScopePillsEnabled` is on (the distribution default).
 *
 * The 2026-09-18 upstream sync replaced the sidebar header with
 * `SidebarThreadHeader` and dropped the pills' JSX, leaving only the import and
 * the setting read. It shipped unnoticed until 0.0.42, and PJ lost the
 * one-click switch. Upstream syncs rewrite `Sidebar.tsx`, which is why the
 * wiring is pinned here.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const SIDEBAR_PATH = NodePath.resolve(import.meta.dirname, "../components/Sidebar.tsx");

describe("Sidebar project scope pills regression guard", () => {
  const source = NodeFS.readFileSync(SIDEBAR_PATH, "utf8");

  it("renders the pills behind the setting", () => {
    expect(source).toMatch(
      /projectScopePillsEnabled &&[\s\S]{0,80}\?\s*\(\s*<T3TeamSidebarProjectScopePills\b/,
    );
  });

  it("wires selection to the shared sidebar scope", () => {
    expect(source).toMatch(
      /<T3TeamSidebarProjectScopePills[\s\S]*?activeScopeKey=\{projectScopeKey\}[\s\S]*?onSelectScope=\{setProjectScopeKey\}/,
    );
  });
});
