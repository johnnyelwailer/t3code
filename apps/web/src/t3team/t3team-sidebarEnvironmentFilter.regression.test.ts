// @effect-diagnostics nodeBuiltinImport:off - regression guard reads component source from disk.
/**
 * Static regression guard: the sidebar narrows its scope by the environment filter and renders the
 * pills. Upstream syncs rewrite `Sidebar.tsx`, so the wiring is pinned here, as the project scope
 * pills' is.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const SIDEBAR_PATH = NodePath.resolve(import.meta.dirname, "../components/Sidebar.tsx");

describe("Sidebar environment filter regression guard", () => {
  const source = NodeFS.readFileSync(SIDEBAR_PATH, "utf8");

  it("renders the pills from the filter and picks through its select", () => {
    expect(source).toMatch(
      /<T3TeamSidebarEnvironmentFilter\s+pills=\{environmentFilter\.pills\}[\s\S]*?selectEnvironment\(environmentId\)/,
    );
  });

  it("narrows the scope keys every list path reads", () => {
    expect(source).toMatch(/const chosenScopeProjectKeys = environmentFilter\.narrowScopeKeys\(/);
  });

  it("narrows search, folders and project pills to the environment", () => {
    expect(source).toMatch(/environmentFilter\.narrowEnvironmentIds\(connectedEnvironmentIds\)/);
    expect(source).toMatch(/environmentFilter\.narrowGroups\(\[/);
    expect(source).toMatch(/groups=\{environmentFilter\.narrowGroups\(projectGroups\)\}/);
  });

  it("clears the filter when a route reveal widens the scope", () => {
    expect(source).toMatch(/setPersistedProjectScopeKeys\(\[\]\);\s*selectEnvironment\(null\);/);
  });
});
