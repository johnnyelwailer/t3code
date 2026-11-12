import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

const src = NodePath.resolve(import.meta.dirname, "..");

function sourceFiles(directory: string): string[] {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("the extension registry sits inside an import cycle when an overlay imports the app", () => {
  it("is never read at module top level, only inside functions and components", () => {
    // Top-level statements start in column 0; everything inside a function is indented.
    const topLevelReads = sourceFiles(src).flatMap((file) =>
      NodeFS.readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ file: NodePath.relative(src, file), line, number: index + 1 }))
        .filter(
          ({ line, file }) =>
            /^(?!\s|\/\/|\*|import |export \{|export type)[^\n]*\bmobileExtensions\b/.test(line) &&
            file !== "extensions/t3team-extensions.ts",
        )
        .map(({ file, number }) => `${file}:${number}`),
    );
    expect(topLevelReads).toEqual([]);
  });
});
