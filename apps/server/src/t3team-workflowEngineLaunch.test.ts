// @effect-diagnostics nodeBuiltinImport:off - test harness reads a workflow fixture + temp dir.
/**
 * Proves a recipe's `.workflow.ts` runs end-to-end through the REAL launch path
 * (`launchWorkflowRecipe` → `createWorkflowEngineBroker` → `T3TeamWorkflowEngineRegistry`),
 * with a recording fake workflow host standing in for the live one. The test plays the
 * resume reactor's role — reading the pending ask the broker registered and calling the run's
 * `resume` — exactly as `T3TeamWorkflowEngineReactorLive` does off real turn-done / user-reply
 * events. The example workflow does agent(schema) in an isolated thread + thread.askUser in the
 * launching thread.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { formatWorkflowOutput } from "./t3team-workflowCompletionMessage.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-exampleReview.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-launch-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

describe("launchWorkflowRecipe — real launch path", () => {
  it("drives the workflow host, parks on each ask, and completes when replies land", async () => {
    const registry = makeWorkflowEngineRegistry();
    const fake = makeFakeWorkflowHost();
    let seq = 0;
    let completed: unknown;

    const runId = "wf-test-run";
    const launchThreadId = "launch-1";
    const localWorkflowPath = NodePath.join(runsRoot, "exampleReview.workflow.ts");
    NodeFS.copyFileSync(workflowPath, localWorkflowPath);
    const result = await launchWorkflowRecipe({
      runId,
      workflowPath: localWorkflowPath,
      args: { prTitle: "Fix the billing rounding bug" },
      runsRoot,
      launchThreadId,
      projectId: ProjectId.make("proj-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      host: fake.host,
      newId: () => `id-${(seq += 1)}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onComplete: async (output) => {
        completed = output;
      },
    });

    // Step activities ride alongside the other host operations (UX slice 1); the operation
    // sequence assertions below check the non-activity stream, then the activity stream is
    // asserted separately at the end.
    const operations = () =>
      fake.ops().filter((op) => op !== "upsertActivity" && op !== "syncRunFacts");
    const stepActivities = () =>
      fake.activities().filter((activity) => activity.kind === "t3team.recipe.workflow.step");

    // The first ask (agent's isolated-thread turn) parks the run.
    expect(result.status).toBe("suspended");
    expect(operations()).toEqual(["createThread", "startTurn"]);
    // agent() spawns a one-shot child linked under the launch thread.
    expect(fake.calls.find((call) => call.op === "createThread")).toMatchObject({
      input: { retention: "ephemeral", parentThreadId: launchThreadId },
    });

    const run = registry.getRun(runId);
    expect(run).toBeDefined();

    // T3Team historically replayed the current workflow source when a run was paused. This
    // source edit must remain compatible after the generic engine gains version identities.
    NodeFS.appendFileSync(localWorkflowPath, "\n// edited while the run was paused\n");

    // Reactor step 1: the agent turn completed on the spawned thread (`${runId}:1`).
    const agentAsk = registry.takePending(`${runId}:1`);
    expect(agentAsk?.kind).toBe("thread.turn");
    await run!.resume(agentAsk!.correlationId, { summary: "Low risk; well tested." });

    // Resuming fired the user escalation as a system message into the launching thread.
    expect(operations()).toEqual(["createThread", "startTurn", "postMessage"]);

    // Reactor step 2: the user replied in the launching thread.
    const userAsk = registry.takePending(launchThreadId);
    expect(userAsk?.kind).toBe("user.input");
    await run!.resume(userAsk!.correlationId, { merge: true });

    expect(completed).toEqual({ summary: "Low risk; well tested.", merged: true });
    expect(registry.getRun(runId)).toBeUndefined(); // completed runs are unregistered
    const completionMessage = fake.messages().find((message) => message.role === "assistant");
    expect(completionMessage).toMatchObject({
      threadId: launchThreadId,
      messageId: `t3team-wf-result:${runId}`,
      text: formatWorkflowOutput(completed),
    });

    // Step activities: every primitive emitted a `t3team.recipe.workflow.step` entry on the
    // launch thread, and each ask re-emitted the SAME id with its terminal phase (upsert-by-id
    // is what makes the client timeline update in place).
    const steps = stepActivities();
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const activity of steps) {
      expect(activity.threadId).toBe(launchThreadId);
      expect(String(activity.id)).toMatch(/^t3team-wf-step:/);
    }
    const phasesById = new Map<string, string[]>();
    for (const activity of steps) {
      const payload = activity.payload as { phase: string };
      const id = String(activity.id);
      phasesById.set(id, [...(phasesById.get(id) ?? []), payload.phase]);
    }
    // The user.input ask (`<runId>:2`... seq varies) must go waiting -> completed on one id.
    const askPhases = [...phasesById.values()].find((p) => p[0] === "waiting");
    expect(askPhases).toBeDefined();
    expect(askPhases?.at(-1)).toBe("completed");
    expect(
      steps.some(
        (activity) =>
          (activity.payload as { projectId?: string; threadId?: string }).projectId === "proj-1" &&
          (activity.payload as { threadId?: string }).threadId === `${runId}:1`,
      ),
    ).toBe(true);
  });

  it("delivers a failure message to the launching thread when a run fails terminally", async () => {
    // Regression: a failed run only emitted Work Log step activities — no message ever
    // reached the launching conversation, so the agent hallucinated "still running".
    const registry = makeWorkflowEngineRegistry();
    const fake = makeFakeWorkflowHost();
    // Invalid source (the YAML-instead-of-TS authoring failure seen live).
    const badPath = NodePath.join(runsRoot, "bad.workflow.ts");
    NodeFS.writeFileSync(badPath, "thread:\n  - agent: not typescript\n");
    let seq = 0;
    let failed: unknown;

    const runId = "wf-fail-run";
    const launchThreadId = "launch-2";
    const result = await launchWorkflowRecipe({
      runId,
      workflowPath: badPath,
      args: {},
      runsRoot,
      launchThreadId,
      projectId: ProjectId.make("proj-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("inst-1"), "model-x"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      host: fake.host,
      newId: () => `fid-${(seq += 1)}`,
      nowIso: () => "2026-01-01T00:00:00.000Z",
      onError: async (error) => {
        failed = error;
      },
    });

    expect(result.status).toBe("failed");
    expect(failed).toBeDefined();
    expect(registry.getRun(runId)).toBeUndefined();
    // Failure and completion share ONE terminal message id per run, so whichever
    // outcome lands last overwrites the other instead of contradicting it.
    const failureMessage = fake
      .messages()
      .find((message) => message.messageId === `t3team-wf-result:${runId}`);
    expect(failureMessage).toMatchObject({
      threadId: launchThreadId,
      role: "assistant",
      text: expect.stringContaining("The orchestration stopped"),
      afterActiveRun: true,
    });
    expect(failureMessage?.text ?? "").toContain("nothing was saved");
  });
});
