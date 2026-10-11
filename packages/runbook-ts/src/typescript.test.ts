import { describe, expect, it } from "vite-plus/test";

import { WorkflowLoadError } from "@runbook/core/errors";

import { loadTypeScript, pickUsableTypeScript } from "./typescript.ts";

const usable = {
  createSourceFile: () => null,
  transpileModule: () => null,
  createCompilerHost: () => null,
};
/** The typescript@7 (tsgo) layout: the entry export carries only the version. */
const versionStub = { version: "7.0.2" };

function catchThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

describe("@runbook/ts typescript loader", () => {
  it("exposes a usable compiler API in the live resolution", () => {
    const ts = loadTypeScript();
    expect(typeof ts.createSourceFile).toBe("function");
    expect(ts.ScriptTarget).toBeDefined();
  });

  it("prefers the static import when it is usable", () => {
    const marker = { ...usable, __marker: "static" };
    expect(pickUsableTypeScript(marker, () => usable)).toBe(marker);
  });

  it("falls back to require when the static import is a version-only stub", () => {
    const marker = { ...usable, __marker: "fallback" };
    expect(pickUsableTypeScript(versionStub, () => marker)).toBe(marker);
  });

  it("throws an actionable WorkflowLoadError when no candidate exposes the compiler API", () => {
    const error = catchThrow(() => pickUsableTypeScript(versionStub, () => versionStub));
    expect(error).toBeInstanceOf(WorkflowLoadError);
    const message = (error as Error).message;
    expect(message).toContain("TypeScript compiler API is unavailable");
    expect(message).toContain("7.0.2");
  });

  it("throws an actionable WorkflowLoadError when the fallback cannot resolve", () => {
    const error = catchThrow(() =>
      pickUsableTypeScript(versionStub, () => {
        throw new Error("ERR_MODULE_NOT_FOUND: typescript");
      }),
    );
    expect(error).toBeInstanceOf(WorkflowLoadError);
    expect((error as Error).message).toContain("ERR_MODULE_NOT_FOUND");
  });
});
