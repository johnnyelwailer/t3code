// @effect-diagnostics nodeBuiltinImport:off - regression guard reads the root route from disk.
/**
 * Every branch that sets the document title has to mount pack appearance sync.
 * Pair, connect, and the pre-auth shell used to mount only DocumentTitleSync,
 * so the tab stayed on the vendor name until a session existed.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const ROOT_PATH = NodePath.resolve(import.meta.dirname, "../routes/__root.tsx");

describe("document title pack appearance", () => {
  const source = NodeFS.readFileSync(ROOT_PATH, "utf8");

  it("mounts pack appearance sync beside every document title", () => {
    const branches = source.split("<DocumentTitleSync />");
    expect(branches.length).toBeGreaterThan(1);
    for (const branch of branches.slice(1)) {
      expect(branch).toMatch(/<T3TeamPackAppearanceSync \/>/);
    }
  });
});
