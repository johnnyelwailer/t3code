/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @effect-diagnostics nodeBuiltinImport:off - test harness reads a workflow fixture + temp dir.
/**
 * Proves a recipe's `.workflow.ts` runs end-to-end through the REAL launch path
 * (`launchWorkflowRecipe` → `createWorkflowEngineBroker` → `T3workWorkflowEngineRegistry`),
 * with a fake orchestration `dispatch` standing in for the live engine. The test plays the
 * resume reactor's role — reading the pending ask the broker registered and calling the run's
 * `resume` — exactly as `T3workWorkflowEngineReactorLive` does off real turn-done / user-reply
 * events. The example workflow does agent(schema) in an isolated thread + thread.askUser in the
 * launching thread.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { type OrchestrationCommand, ProjectId } from "@t3tools/contracts";
import { ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3work-exampleReview.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-launch-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

describe("launchWorkflowRecipe — real launch path", () => {
  it("dispatches orchestration commands, parks on each ask, and completes when replies land", async () => {
    const registry = makeWorkflowEngineRegistry();
    const dispatched: OrchestrationCommand[] = [];
    const dispatch = async (command: OrchestrationCommand): Promise<void> => {
      dispatched.push(command);
    };
    let seq = 0;
    let completed: unknown;

    const runId = "wf-test-run";
    const launchThreadId = "launch-1";
    const result = await launchWorkflowRecipe({
      runId,
      workflowPath,
      args: { prTitle: "Fix the billing rounding bug" },
      runsRoot,
      launchThreadId,
      projectId: ProjectId.make("proj-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch,
      newId: () => `id-${(seq += 1)}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onComplete: async (output) => {
        completed = output;
      },
    });

    // The first ask (agent's isolated-thread turn) parks the run.
    expect(result.status).toBe("suspended");
    expect(dispatched.map((c) => c.type)).toEqual(["thread.create", "thread.turn.start"]);

    const run = registry.getRun(runId);
    expect(run).toBeDefined();

    // Reactor step 1: the agent turn completed on the spawned thread (`${runId}:1`).
    const agentAsk = registry.takePending(`${runId}:1`);
    expect(agentAsk?.kind).toBe("thread.turn");
    await run!.resume(agentAsk!.correlationId, { summary: "Low risk; well tested." });

    // Resuming fired the user escalation as a system message into the launching thread.
    expect(dispatched.map((c) => c.type)).toEqual([
      "thread.create",
      "thread.turn.start",
      "thread.message.upsert",
    ]);

    // Reactor step 2: the user replied in the launching thread.
    const userAsk = registry.takePending(launchThreadId);
    expect(userAsk?.kind).toBe("user.input");
    await run!.resume(userAsk!.correlationId, { merge: true });

    expect(completed).toEqual({ summary: "Low risk; well tested.", merged: true });
    expect(registry.getRun(runId)).toBeUndefined(); // completed runs are unregistered
  });
});
