// @effect-diagnostics nodeBuiltinImport:off - loads its subject under a REAL node process.
/**
 * The scaffolded `describe-rewrite` body must be SOURCE TEXT under every loader that runs this
 * server. Three do, and they disagree about `?raw`:
 *   • vite (`vp test`) inlines the text — which is why the sibling execute-the-body test passed
 *     while the dev backend was writing `"async function run() { …"` into user workspaces;
 *   • rolldown (`vp pack`) inlines it via `scripts/t3team-rawTextPackPlugin.ts`;
 *   • plain `node` (the dev backend, `node --watch src/bin.ts`) IGNORES the query and imports the
 *     module as CODE.
 *
 * So the last case cannot be covered from inside vitest: this file spawns a real `node` process,
 * which is the only way to observe the loader that actually broke.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { DESCRIPTION_REWRITE_WORKFLOW_BODY } from "./t3team-descriptionRewriteBody.ts";
import { renderDescriptionRewriteWorkflow } from "./t3team-projectSetupDescriptionRewriteRecipe.ts";

const bodyModuleUrl = new URL("./t3team-descriptionRewriteBody.ts", import.meta.url);
const workflowSourceUrl = new URL("./t3team-descriptionRewrite.workflow.ts", import.meta.url);

describe("describe-rewrite body text", () => {
  it("is the workflow module's own source, byte for byte", () => {
    expect(DESCRIPTION_REWRITE_WORKFLOW_BODY).toBe(NodeFS.readFileSync(workflowSourceUrl, "utf8"));
    expect(renderDescriptionRewriteWorkflow()).toBe(DESCRIPTION_REWRITE_WORKFLOW_BODY);
  });

  it("is source text, not a stringified function", () => {
    // The exact fingerprint of the regression: `String(<default export>)`.
    expect(DESCRIPTION_REWRITE_WORKFLOW_BODY.startsWith("async function run()")).toBe(false);
    expect(DESCRIPTION_REWRITE_WORKFLOW_BODY).toContain("export const meta");
    expect(DESCRIPTION_REWRITE_WORKFLOW_BODY).toContain('import { Schema } from "effect"');
    expect(DESCRIPTION_REWRITE_WORKFLOW_BODY).toContain("export default async function run()");
  });

  it("resolves to source text under a real node process too — the dev backend's loader", () => {
    const printed = NodeChildProcess.execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(bodyModuleUrl.href)});
         process.stdout.write(String(m.DESCRIPTION_REWRITE_WORKFLOW_BODY));`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );

    // Under `?raw`-blind node this used to be `"async function run() {…"`, and the engine rejected
    // the scaffolded file with "has no top-level `const meta = …` declaration".
    expect(printed).toContain("export const meta");
    expect(printed).toBe(DESCRIPTION_REWRITE_WORKFLOW_BODY);
  });
});
