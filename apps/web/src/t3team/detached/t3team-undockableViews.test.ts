import { DETACHED_VIEW_KIND } from "@t3tools/shared/t3team-detachedView";
import { describe, expect, it } from "vite-plus/test";

import { UNDOCK_POLICY, undockPolicyForPath } from "./t3team-undockableViews";
import { undockViewRequest, undockViewTitle } from "./t3team-undockView";

const ROUTE_SOURCES = import.meta.glob<string>("/src/routes/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Every routed view's path, as its route file declares it, with pathless layouts dropped. */
function routedViewPaths(): string[] {
  return Object.entries(ROUTE_SOURCES)
    .filter(([file]) => !file.endsWith("/__root.tsx"))
    .flatMap(([file, source]) => {
      const id = /createFileRoute\("([^"]+)"\)/.exec(source)?.[1];
      if (id === undefined) throw new Error(`${file} declares no file route`);
      const segments = id.split("/").filter((segment) => segment !== "");
      // A pathless layout (`/_chat`) renders no view of its own; its children are listed.
      // `/_chat/` (trailing slash) is that layout's index, which is a view.
      const isLayout = !id.endsWith("/") && segments.every((segment) => segment.startsWith("_"));
      if (segments.length > 0 && isLayout) return [];
      const path = `/${segments.filter((segment) => !segment.startsWith("_")).join("/")}`;
      return [path];
    });
}

const policyPatternFor = (path: string) =>
  path.startsWith("/settings/") ? "/settings/$section" : path;

const samplePath = (path: string) =>
  path.replaceAll(/\$(\w+)/g, (_match, name) => `sample-${name}`);

describe("undock policy", () => {
  const paths = routedViewPaths();

  it("decides for every routed view, by that view's own route", () => {
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) {
      const match = undockPolicyForPath(samplePath(path));
      expect(match?.pattern, `no undock decision for ${path}`).toBe(policyPatternFor(path));
    }
  });

  it("names no route the app does not have", () => {
    const declared = new Set(paths.map(policyPatternFor));
    expect(Object.keys(UNDOCK_POLICY).filter((pattern) => !declared.has(pattern))).toEqual([]);
  });

  it("gives every view that stays docked a reason", () => {
    for (const [pattern, policy] of Object.entries(UNDOCK_POLICY)) {
      if (!policy.undock) expect(policy.reason.length, pattern).toBeGreaterThan(10);
    }
  });

  it("opens every undockable view on its own route, search included", () => {
    for (const path of paths) {
      const match = undockPolicyForPath(samplePath(path));
      if (!match?.policy.undock) continue;
      const request = undockViewRequest({ pathname: samplePath(path), searchStr: "?a=1&b=two" });
      expect(request?.kind, path).toBe(DETACHED_VIEW_KIND);
      expect(request?.params.path).toBe(`${samplePath(path)}?a=1&b=two`);
      expect(request?.title.length).toBeGreaterThan(0);
    }
  });

  it("offers nothing for a view that stays docked", () => {
    for (const pathname of [
      "/welcome",
      "/pair",
      "/t3team/new",
      "/t3team-detached/view",
      "/x/y/z",
    ]) {
      expect(undockViewRequest({ pathname, searchStr: "" }), pathname).toBe(null);
    }
  });

  it("titles the window after the view", () => {
    expect(undockViewTitle({ pathname: "/t3team/my-work", searchStr: "" })).toBe("My Work");
    expect(
      undockViewTitle({ pathname: "/t3team/projects/p1", searchStr: "?projectView=backlog" }),
    ).toBe("Backlog");
    expect(undockViewTitle({ pathname: "/t3team/projects/p1/tickets/NEX-12", searchStr: "" })).toBe(
      "NEX-12",
    );
    expect(undockViewTitle({ pathname: "/settings/appearance", searchStr: "" })).toBe("Settings");
  });
});
