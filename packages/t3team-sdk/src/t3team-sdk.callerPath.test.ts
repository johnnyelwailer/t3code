import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as Parent from "./__fixtures__/t3team-sdk.callerPathParent.workflow.ts";
import { defineWorkflow, startWorkflow } from "./t3team-sdk.index.ts";

/**
 * Regression: eb59059498 names the runbook-ts VM executions `(runbook-ts) <sourcePath>` so V8
 * coverage cannot attribute a VM body to the source file. That resource name must NOT leak into
 * `findCallerFilePath()` — a sub-workflow body that resolves a relative path from inside the VM
 * must resolve against the body's REAL file, not the labeled name.
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-caller-path-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const parent = defineWorkflow<typeof Parent>(
  "./__fixtures__/t3team-sdk.callerPathParent.workflow.ts",
);

describe("sub-workflow caller-path resolution through the runbook-ts VM", () => {
  it("resolves a relative sub-workflow path against the real body file", async () => {
    const result = await startWorkflow(parent, {}, { runsRoot, tools: [] });
    expect(result).toMatchObject({ result: { marker: "child ran" } });
  });
});
