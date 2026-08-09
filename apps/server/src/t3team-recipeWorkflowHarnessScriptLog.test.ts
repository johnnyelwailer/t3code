/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- mirrors t3team-recipeWorkflowScripts.test.ts: an async launch test bridging the Effect runtime. */
// @effect-diagnostics nodeBuiltinImport:off - the test materializes a recipe dir + runs root on disk.
/**
 * `scriptCalls` must be an INVOCATION log, not a declaration list.
 *
 * The harness used to report `recipe.scriptNames`, so an E2E assertion on `scriptCalls` passed
 * for a recipe that registered a script and never called it. These tests pin the fix at both
 * ends:
 *
 *   1. End to end — a real `launchWorkflowRecipe` over a recipe registering TWO scripts whose
 *      body calls only ONE (and calls it twice). The journal-derived log shows exactly the two
 *      dispatches in order, and the uncalled registration is reported as such. This is the case
 *      that used to pass falsely.
 *   2. Unit — the derivation itself: `seq` ordering, `script-never` markers counted, non-script
 *      primitives ignored.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { FsJournalStore } from "@t3team/sdk";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  buildT3TeamHarnessScriptLog,
  readT3TeamHarnessScriptLog,
} from "./t3team-recipeWorkflowHarnessScriptLog.ts";
import { resolveRecipeWorkflowScripts } from "./t3team-recipeWorkflowScripts.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

const fixtureRoot = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../__fixtures__",
);
const workspaceRoot = NodeFS.mkdtempSync(
  NodePath.join(fixtureRoot, "t3team-script-log-workspace-"),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-script-log-runs-"));
afterAll(() => {
  NodeFS.rmSync(workspaceRoot, { recursive: true, force: true });
  NodeFS.rmSync(runsRoot, { recursive: true, force: true });
});

// A recipe declaring TWO scripts. The workflow body calls `doubleIt` twice and never touches
// `neverCalled` — precisely the over-claim the old `scriptCalls` could not see.
const recipeRoot = NodePath.join(workspaceRoot, ".t3team", "recipes", "script-log");
NodeFS.mkdirSync(NodePath.join(recipeRoot, "scripts"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "scripts", "doubleIt.ts"),
  `
import { Schema } from "effect";
import { defineScript } from "@t3team/sdk";

export default defineScript({
  inputs: Schema.Struct({ value: Schema.Number }),
  outputs: Schema.Struct({ doubled: Schema.Number }),
  handler: async (args) => ({ doubled: args.value * 2 }),
});
`,
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "scripts", "neverCalled.ts"),
  `
import { Schema } from "effect";
import { defineScript } from "@t3team/sdk";

export default defineScript({
  inputs: Schema.Struct({}),
  outputs: Schema.Struct({}),
  handler: async () => ({}),
});
`,
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "double.workflow.ts"),
  `
import { Schema } from "effect";

export const Inputs = Schema.Struct({ value: Schema.Number });
export const Outputs = Schema.Struct({ total: Schema.Number });

export const meta = {
  name: "script-log.double",
  description: "Call one registered script twice; leave the other untouched.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["script"],
} as const;

const input = Schema.decodeSync(Inputs)(args);
const first = await scripts.doubleIt({ value: input.value });
const second = await scripts.doubleIt({ value: first.doubled });
return { total: second.doubled };
`,
);
NodeFS.writeFileSync(
  NodePath.join(recipeRoot, "recipe.ts"),
  `
import { defineRecipe, defineWorkflow } from "@t3team/sdk";

import doubleIt from "./scripts/doubleIt.ts";
import neverCalled from "./scripts/neverCalled.ts";
import type * as DoubleWorkflow from "./double.workflow.ts";

export default defineRecipe({
  id: "script-log",
  version: "0.1.0",
  title: "Script log",
  shortDescription: "Declares two scripts, calls one.",
  surfaces: ["workitem.detail.sidepanel"],
  scripts: { doubleIt, neverCalled },
  defaultAction: defineWorkflow<typeof DoubleWorkflow>("./double.workflow.ts"),
});
`,
);

const workflowPath = NodePath.join(recipeRoot, "double.workflow.ts");

describe("harness scriptCalls is a real invocation log", () => {
  it("reports the journaled scripts.* dispatches, in order, and flags a declared-but-uncalled script", async () => {
    const scripts = await Effect.runPromise(
      Effect.scoped(
        resolveRecipeWorkflowScripts({ recipePath: recipeRoot, workflowPath }).pipe(
          Effect.provide(NodeServices.layer),
        ),
      ),
    );
    // Both are REGISTERED — the declaration set the old report echoed back verbatim.
    expect(Object.keys(scripts).toSorted()).toEqual(["doubleIt", "neverCalled"]);

    const dispatched: OrchestrationCommand[] = [];
    let seq = 0;
    const runId = "script-log-run-1";
    const result = await launchWorkflowRecipe({
      runId,
      workflowPath,
      args: { value: 3 },
      scripts,
      runsRoot,
      launchThreadId: "launch-script-log-1",
      projectId: ProjectId.make("proj-script-log"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry: makeWorkflowEngineRegistry(),
      dispatch: async (command) => {
        dispatched.push(command);
      },
      newId: () => `id-${(seq += 1)}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(result.status).toBe("completed");

    const log = await readT3TeamHarnessScriptLog({
      store: new FsJournalStore(runsRoot),
      runId,
      declaredScripts: Object.keys(scripts),
    });
    // Two ACTUAL dispatches of the same script — count and order, not a distinct set.
    expect(log.scriptCalls).toEqual(["doubleIt", "doubleIt"]);
    expect(log.declaredScripts).toEqual(["doubleIt", "neverCalled"]);
    // The assertion that makes the gate honest: declaring a script is not calling it.
    expect(log.uncalledScripts).toEqual(["neverCalled"]);
  });

  it("orders by journal seq, counts script-never markers, and ignores non-script primitives", () => {
    const log = buildT3TeamHarnessScriptLog({
      entries: [
        { seq: 4, kind: "script", refId: "second" },
        { seq: 1, kind: "script", refId: "first" },
        { seq: 3, kind: "thread.turn", refId: "agent" },
        { seq: 2, kind: "script-never", refId: "sideEffect" },
        { seq: 5, kind: "tool", refId: "github.merge" },
      ],
      declaredScripts: ["second", "first", "sideEffect", "orphan", "orphan"],
    });
    expect(log.scriptCalls).toEqual(["first", "sideEffect", "second"]);
    expect(log.declaredScripts).toEqual(["first", "orphan", "second", "sideEffect"]);
    expect(log.uncalledScripts).toEqual(["orphan"]);
  });
});
