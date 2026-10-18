// @effect-diagnostics nodeBuiltinImport:off - compiles real source files on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { transform } from "oxc-transform-react";
import { describe, expect, it } from "vite-plus/test";

import { t3teamReactCompilerPending as pending } from "../vite/t3team-reactCompilerPending.ts";

// Upstream requires every web file to compile under the React Compiler and lints its bailout
// rules as errors. Fork-only files that predate that rule sit on this ratchet:
//   - `bailouts`: the compiler skips the file (reactCompilerCoverage.test.ts skips it too).
//   - `lintOnly`: the file compiles, but still has manual memo or compiler-rule lint errors.
// Both lists are exempt from the compiler lint rules in vite.config.ts. They only shrink: convert
// a file, delete its entry. Upstream files never go here; fix those for real.
const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);
const guardConfig: { allowedUnprefixedNewFiles: string[] } = JSON.parse(
  NodeFS.readFileSync(NodePath.join(repoRoot, ".t3team-additive-guard.json"), "utf8"),
);

const compile = async (file: string) => {
  const absolute = NodePath.join(repoRoot, file);
  const result = await transform(absolute, NodeFS.readFileSync(absolute, "utf8"), {
    jsx: { runtime: "automatic", development: false, refresh: false },
    reactCompiler: { reportDiagnostics: true },
  });
  return result.errors;
};

describe("t3team React Compiler ratchet", () => {
  const all = [...pending.bailouts, ...pending.lintOnly];

  it("lists each file once, sorted", () => {
    expect(new Set(all).size).toBe(all.length);
    expect(pending.bailouts).toEqual([...pending.bailouts].toSorted());
    expect(pending.lintOnly).toEqual([...pending.lintOnly].toSorted());
  });

  it("lists only existing fork-owned files", () => {
    for (const file of all) {
      expect(NodeFS.existsSync(NodePath.join(repoRoot, file)), file).toBe(true);
      const forkOwned =
        file.includes("t3team") || guardConfig.allowedUnprefixedNewFiles.includes(file);
      expect(forkOwned, file).toBe(true);
    }
  });

  it.each(pending.bailouts)(
    "%s still bails out (delete the entry once it compiles)",
    async (file) => {
      expect((await compile(file)).length).toBeGreaterThan(0);
    },
  );
}, 120_000);
