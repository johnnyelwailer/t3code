// @effect-diagnostics nodeBuiltinImport:off - regression guard reads the root route and shell from disk.
/**
 * Every routed view must sit under the desktop window drag strip, and every control that
 * overlaps it must opt out after it in document order (Electron resolves app regions in
 * document order; z-index plays no part). The project dashboard (My Work, Backlog, Planning),
 * work-item detail and setup headers once lost window dragging because each view had to opt
 * in on its own and one header dropped out.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const read = (relativePath: string) =>
  NodeFS.readFileSync(NodePath.resolve(import.meta.dirname, relativePath), "utf8");

function readRouteViews(rootSource: string) {
  const routeOptions = rootSource.slice(rootSource.indexOf("export const Route = createRootRoute"));
  return [...routeOptions.matchAll(/^ {2}(component|errorComponent|notFoundComponent): (.+),$/gm)];
}

describe("window drag strip", () => {
  it("wraps every root route view, so every routed view renders it", () => {
    const views = readRouteViews(read("../routes/__root.tsx"));

    expect(views.map(([, key]) => key)).toEqual([
      "component",
      "errorComponent",
      "notFoundComponent",
    ]);
    for (const [, , view] of views) {
      expect(view).toMatch(/^withT3TeamWindowDragStrip\(\w+\)$/);
    }
  });

  it("renders the floating left sidebar toggle after the content headers it overlaps", () => {
    const shell = read("./t3team-App.tsx");
    const content = shell.indexOf("<AppContentPane");
    const toggle = shell.indexOf("<T3TeamLeftSidebarDesktopToggle />");

    expect(content).toBeGreaterThan(-1);
    expect(toggle).toBeGreaterThan(content);
  });

  it("drags from the strip and lets every portaled popup opt out", () => {
    const css = read("../index.css");

    expect(css).toMatch(/\.window-drag-strip \{[^}]*-webkit-app-region: drag;/);
    expect(css).toMatch(/\[data-slot\$="-popup"\] \{\s*-webkit-app-region: no-drag;/);
  });
});
