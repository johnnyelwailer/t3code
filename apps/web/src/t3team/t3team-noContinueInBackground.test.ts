// @effect-diagnostics nodeBuiltinImport:off - regression guard walks app source on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

const FORBIDDEN = /Continue in background/i;
const ROOTS = [
  NodePath.join(import.meta.dirname, "../.."),
  NodePath.join(import.meta.dirname, "../../../../apps/desktop/src"),
  NodePath.join(import.meta.dirname, "../../../../apps/mobile/src"),
];
const SKIP_DIR = new Set(["node_modules", "dist", ".git", ".repos", "vendor"]);
const SKIP_FILE = /\.test\.(ts|tsx)$/;
const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mdx", ".md", ".json", ".css", ".html"]);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = NodeFS.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const path = NodePath.join(dir, name);
    const stat = NodeFS.statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
    } else if (CODE.has(NodePath.extname(name)) && !SKIP_FILE.test(name)) {
      yield path;
    }
  }
}

describe("optimistic UI: no Continue in background", () => {
  it("no source in the app contains that copy", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const text = NodeFS.readFileSync(file, "utf8");
        if (!FORBIDDEN.test(text)) continue;
        for (const [index, line] of text.split(/\r?\n/).entries()) {
          if (FORBIDDEN.test(line)) {
            hits.push(`${NodePath.relative(root, file)}:${index + 1}: ${line.trim()}`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
