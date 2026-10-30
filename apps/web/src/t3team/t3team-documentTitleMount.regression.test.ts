// @effect-diagnostics nodeBuiltinImport:off - regression guard reads the root route from disk.
/**
 * Every root branch that sets the document title has to get pack appearance sync.
 * Pair, connect, and the pre-auth shell used to mount only DocumentTitleSync,
 * so the tab stayed on the vendor name until a session existed.
 *
 * Upstream's root route no longer mounts a title component per branch: the title is set from app
 * start. The fork's pack title and pack appearance sync therefore live in one coordinator,
 * mounted once above `RootRouteBranch` so it covers every branch. Pin both halves of that.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const ROOT_PATH = NodePath.resolve(import.meta.dirname, "../routes/__root.tsx");
const COORDINATORS_PATH = NodePath.resolve(import.meta.dirname, "./t3team-RootCoordinators.tsx");

describe("document title pack appearance", () => {
  it("mounts the coordinators once, above every root branch", () => {
    const source = NodeFS.readFileSync(ROOT_PATH, "utf8");
    expect(source.match(/<T3TeamRootCoordinators \/>/g)).toHaveLength(1);
    expect(source).toMatch(/<T3TeamRootCoordinators \/>\s*<RootRouteBranch \/>/);
  });

  it("mounts pack appearance sync beside the pack document title", () => {
    const source = NodeFS.readFileSync(COORDINATORS_PATH, "utf8");
    const mounted = source.slice(source.indexOf("export function T3TeamRootCoordinators"));
    expect(mounted).toMatch(/<T3TeamPackAppearanceSync \/>/);
    expect(mounted).toMatch(/<T3TeamPackAppearanceDefaultsSync \/>/);
    expect(mounted).toMatch(/<T3TeamPackDocumentTitle \/>/);
  });

  it("never skips the coordinators for the branches that used to miss them", () => {
    // Only the guest page opts out (a tunnel host with no session and no pack).
    const source = NodeFS.readFileSync(COORDINATORS_PATH, "utf8");
    const opOuts = source.match(/if \(pathname === GUEST_PAGE_PATH\) return null;/g);
    expect(opOuts).toHaveLength(1);
  });
});
