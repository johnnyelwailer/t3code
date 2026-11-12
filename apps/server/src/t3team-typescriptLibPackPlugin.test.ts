// @effect-diagnostics nodeBuiltinImport:off - exercises a build-time bundler plugin against a temp directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { typeCheckCompilerOptions } from "../../../packages/runbook-ts/src/typeCheckHost.ts";
import { loadTypeScript } from "../../../packages/runbook-ts/src/typescript.ts";
import { t3teamTypescriptLibPackPlugin } from "../scripts/t3team-typescriptLibPackPlugin.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
});

const writeBundleInto = (): string => {
  const outDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "ts-lib-pack-"));
  tempDirs.push(outDir);
  t3teamTypescriptLibPackPlugin().writeBundle({ dir: outDir });
  return outDir;
};

describe("t3teamTypescriptLibPackPlugin", () => {
  // The inlined compiler resolves a lib at dirname(chunk)/<name>, so the type
  // checker's configured libs must sit directly in the output directory. A
  // lib/ subdirectory leaves every global type unresolved (ts2304/ts2583).
  it("writes every lib the type-check host configures directly beside the chunks", () => {
    const outDir = writeBundleInto();
    for (const lib of typeCheckCompilerOptions(loadTypeScript()).lib ?? []) {
      expect(NodeFS.existsSync(NodePath.join(outDir, lib)), lib).toBe(true);
    }
    expect(NodeFS.existsSync(NodePath.join(outDir, "lib"))).toBe(false);
  });

  it("ships the whole lib reference closure and nothing but lib.*.d.ts", () => {
    const outDir = writeBundleInto();
    const files = NodeFS.readdirSync(outDir);
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) expect(file).toMatch(/^lib\.([\w.]+\.)?d\.ts$/);
    // Every `/// <reference lib="x" />` in a shipped lib resolves to a shipped lib.
    for (const file of files) {
      const source = NodeFS.readFileSync(NodePath.join(outDir, file), "utf8");
      for (const match of source.matchAll(/\/\/\/ <reference lib="([^"]+)"/g)) {
        expect(files, `${file} -> ${match[1]}`).toContain(`lib.${match[1]}.d.ts`);
      }
    }
  });
});
