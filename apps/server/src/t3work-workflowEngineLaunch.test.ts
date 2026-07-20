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

    // Step activities ride alongside the orchestration commands (UX slice 1); the command
    // sequence assertions below check the non-activity stream, then the activity stream is
    // asserted separately at the end.
    const commandTypes = () =>
      dispatched.filter((c) => c.type !== "thread.activity.append").map((c) => c.type);
    const stepActivities = () =>
      dispatched.flatMap((c) =>
        c.type === "thread.activity.append" && c.activity.kind === "t3work.recipe.workflow.step"
          ? [c.activity]
          : [],
      );

    // The first ask (agent's isolated-thread turn) parks the run.
    expect(result.status).toBe("suspended");
    expect(commandTypes()).toEqual(["thread.create", "thread.turn.start"]);
    const childPlacement = dispatched.find(
      (command) =>
        command.type === "thread.activity.append" &&
        command.activity.kind === "t3work.handoff.created",
    );
    expect(childPlacement).toBeUndefined(); // agent() child is ephemeral unless explicitly retained

    const run = registry.getRun(runId);
    expect(run).toBeDefined();

    // Reactor step 1: the agent turn completed on the spawned thread (`${runId}:1`).
    const agentAsk = registry.takePending(`${runId}:1`);
    expect(agentAsk?.kind).toBe("thread.turn");
    await run!.resume(agentAsk!.correlationId, { summary: "Low risk; well tested." });

    // Resuming fired the user escalation as a system message into the launching thread.
    expect(commandTypes()).toEqual(["thread.create", "thread.turn.start", "thread.message.upsert"]);

    // Reactor step 2: the user replied in the launching thread.
    const userAsk = registry.takePending(launchThreadId);
    expect(userAsk?.kind).toBe("user.input");
    await run!.resume(userAsk!.correlationId, { merge: true });

    expect(completed).toEqual({ summary: "Low risk; well tested.", merged: true });
    expect(registry.getRun(runId)).toBeUndefined(); // completed runs are unregistered
    const completionMessage = dispatched.find(
      (command) => command.type === "thread.message.upsert" && command.message.role === "assistant",
    );
    expect(completionMessage).toMatchObject({
      threadId: launchThreadId,
      message: {
        messageId: `t3work-wf-result:${runId}`,
        // formatWorkflowOutput deliberately prefers the readable `summary` field
        // over a raw JSON dump of the full output record.
        text: "Low risk; well tested.",
      },
    });

    // Step activities: every primitive emitted a `t3work.recipe.workflow.step` entry on the
    // launch thread, and each ask re-emitted the SAME id with its terminal phase (upsert-by-id
    // is what makes the client timeline update in place).
    const steps = stepActivities();
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const activity of steps) {
      expect(activity.kind).toBe("t3work.recipe.workflow.step");
      expect(String(activity.id)).toMatch(/^t3work-wf-step:/);
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
    const dispatched: OrchestrationCommand[] = [];
    const dispatch = async (command: OrchestrationCommand): Promise<void> => {
      dispatched.push(command);
    };
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
      dispatch,
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
    const failureMessage = dispatched.find(
      (command) =>
        command.type === "thread.message.upsert" &&
        String(command.message.messageId) === `t3work-wf-result:${runId}`,
    );
    expect(failureMessage).toMatchObject({
      threadId: launchThreadId,
      message: {
        role: "assistant",
        text: expect.stringContaining("Workflow run failed"),
      },
    });
  });
});
