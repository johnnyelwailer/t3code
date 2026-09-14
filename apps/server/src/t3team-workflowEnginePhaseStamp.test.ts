// @effect-diagnostics nodeBuiltinImport:off - test harness reads a workflow fixture + temp dir.
/**
 * Proves the server stamps each `t3team.recipe.workflow.step` activity with the AUTHORED
 * `phase()` group active in the workflow body when the primitive was sent —
 * `WorkflowEngineBrokerDeps.currentPhase` / `t3team-workflowEngineController.ts` — through the
 * REAL launch path, exactly like `t3team-workflowEngineLaunch.test.ts` does for the base case.
 *
 * The interesting assertion is across the suspend/resume boundary between the two turns: a
 * resume replays the WHOLE body from the top (fast-forwarding through the already-recorded first
 * turn), so the second turn's stamp must come from a FRESH re-execution of both `phase()` calls,
 * not a stale value carried over from launch — see the comment on `currentWorkflowPhase` in
 * `t3team-workflowEngineController.ts` for why a plain in-memory cell reconstructs correctly here
 * without needing `phase()` itself to be journaled (unlike `now()`, it reads no host entropy).
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";

const workflowPath = NodeURL.fileURLToPath(
  new URL("../__fixtures__/t3team-examplePhaseStamp.workflow.ts", import.meta.url),
);
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-phase-stamp-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

describe("workflow step activities — authored phase stamp", () => {
  it("stamps a step's SENT activity with the live phase, and its RESOLVED re-emission with the SAME phase, across a resume", async () => {
    const registry = makeWorkflowEngineRegistry();
    const dispatched: OrchestrationCommand[] = [];
    const dispatch = async (command: OrchestrationCommand): Promise<void> => {
      dispatched.push(command);
    };
    let seq = 0;
    const runId = "wf-phase-stamp";
    const launchThreadId = "launch-1";
    const localWorkflowPath = NodePath.join(runsRoot, "examplePhaseStamp.workflow.ts");
    NodeFS.copyFileSync(workflowPath, localWorkflowPath);

    const result = await launchWorkflowRecipe({
      runId,
      workflowPath: localWorkflowPath,
      args: {},
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
    });

    // Parked on the first agent turn (no reply yet).
    expect(result.status).toBe("suspended");

    const stepActivities = () =>
      dispatched.flatMap((c) =>
        c.type === "thread.activity.append" && c.activity.kind === "t3team.recipe.workflow.step"
          ? [c.activity]
          : [],
      );
    const childThreadIds = () =>
      dispatched.filter((c) => c.type === "thread.create").map((c) => String(c.threadId));

    const firstSent = stepActivities().find(
      (activity) => (activity.payload as { detail?: string }).detail === "First turn",
    );
    expect((firstSent?.payload as { workflowPhase?: string } | undefined)?.workflowPhase).toBe(
      "Phase One",
    );

    const [firstThreadId] = childThreadIds();
    const firstAsk = registry.takePending(firstThreadId!);
    expect(firstAsk?.kind).toBe("thread.turn");
    const run = registry.getRun(runId)!;
    await run.resume(firstAsk!.correlationId, "ok-1");

    // The first turn's terminal re-emission (same activity id, upserted) carries the SAME phase
    // it was SENT under — reused from the remembered record, not recomputed after the fact.
    const firstResolved = stepActivities().find(
      (activity) =>
        (activity.payload as { detail?: string; phase?: string }).detail === "First turn" &&
        (activity.payload as { phase?: string }).phase === "completed",
    );
    expect((firstResolved?.payload as { workflowPhase?: string } | undefined)?.workflowPhase).toBe(
      "Phase One",
    );

    // The second turn only exists because the resume above replayed the whole body forward past
    // `phase("Phase Two")` — its SENT activity must reflect that, not "Phase One".
    const secondSent = stepActivities().find(
      (activity) => (activity.payload as { detail?: string }).detail === "Second turn",
    );
    expect((secondSent?.payload as { workflowPhase?: string } | undefined)?.workflowPhase).toBe(
      "Phase Two",
    );

    const [, secondThreadId] = childThreadIds();
    const secondAsk = registry.takePending(secondThreadId!);
    await run.resume(secondAsk!.correlationId, "ok-2");
    expect(registry.getRun(runId)).toBeUndefined(); // completed
  });
});
