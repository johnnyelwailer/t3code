// @effect-diagnostics nodeBuiltinImport:off - writes a temp workflow module to import for real.
/**
 * Both body shapes must run while the migration is in flight (Epic 25 §Implementation status):
 * a default-exported async function goes through a real ESM import, and a legacy top-level-statement
 * body keeps the vm wrapper. The ESM path is the one that makes bodies typecheck, so it has to work
 * with REAL imports — which is why this test writes a module to disk and imports it rather than
 * faking the loader.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import { isEsmWorkflowBody, runWorkflowBody } from "./t3team-sdk.loader.ts";
import { withBodyApi } from "./t3team-sdk.engineApi.ts";

const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-esm-body-"));
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const writeBody = (name: string, text: string): string => {
  const file = NodePath.join(root, name);
  NodeFS.writeFileSync(file, text);
  return file;
};

describe("isEsmWorkflowBody", () => {
  it("recognises a default-exported body and not a legacy one", () => {
    expect(isEsmWorkflowBody('export default async function run() {\n  return 1;\n}\n')).toBe(true);
    expect(isEsmWorkflowBody('phase("Go");\nreturn 1;\n')).toBe(false);
    // A body that merely mentions the words must not be misread as the ESM shape.
    expect(isEsmWorkflowBody('const s = "export default";\nreturn s;\n')).toBe(false);
  });
});

describe("ESM-shaped workflow bodies", () => {
  it("imports the module for real and returns its default export's result", async () => {
    const sourceText = "export default async function run() {\n  return { ok: true, from: 'esm' };\n}\n";
    const absolutePath = writeBody("plain.mjs", sourceText);

    const output = await runWorkflowBody(
      { metaScript: "", bodyScript: "" } as never,
      { absolutePath, sourceText } as never,
      {},
    );

    expect(output).toEqual({ ok: true, from: "esm" });
  });

  // The whole point: the body reaches the engine surface through an IMPORT, resolved from the
  // ambient run rather than from an injected global.
  it("lets the body reach the run through imported verbs", async () => {
    const sdkPath = NodePath.join(import.meta.dirname, "t3team-sdk.engineApi.ts");
    const sourceText =
      `import { getArgs, phase } from ${JSON.stringify(sdkPath)};\n` +
      "export default async function run() {\n" +
      "  phase('Imported');\n" +
      "  const args = getArgs();\n" +
      "  return { seen: args };\n" +
      "}\n";
    const absolutePath = writeBody("imports.mts", sourceText);

    const phases: string[] = [];
    const output = await withBodyApi(
      { args: { prTitle: "Add retry" }, phase: (title: string) => phases.push(title) },
      () =>
        runWorkflowBody(
          { metaScript: "", bodyScript: "" } as never,
          { absolutePath, sourceText } as never,
          {},
        ),
    );

    expect(phases).toEqual(["Imported"]);
    expect(output).toEqual({ seen: { prTitle: "Add retry" } });
  });

  it("rejects a default export that is not callable", async () => {
    const sourceText = "export default { notAFunction: true };\n";
    const absolutePath = writeBody("bad.mjs", sourceText);

    await expect(
      runWorkflowBody(
        { metaScript: "", bodyScript: "" } as never,
        { absolutePath, sourceText } as never,
        {},
      ),
    ).rejects.toThrow(/must default-export the async function the engine calls/);
  });
});
