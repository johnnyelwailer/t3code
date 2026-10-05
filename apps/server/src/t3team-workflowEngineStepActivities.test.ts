/**
 * `emitResolved` stamps `durationMs` from the step's remembered start (see the doc on
 * `SentStepRecord` and on `ProjectRecipeWorkflowStepActivityPayload.durationMs`), and MUST omit
 * it — never guess or zero it — when that start was never remembered: the initial (non-terminal)
 * emission, and a resolve after a server restart (`sentByCorrelation` is process-local and empty).
 * Both emissions upsert the SAME keyed activity, so the step updates in place.
 */
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";

function makeEmitter(clock: ReadonlyArray<string>) {
  const fake = makeFakeWorkflowHost();
  let tick = 0;
  const emitter = createWorkflowStepActivityEmitter({
    runId: "run-1",
    projectId: "project-1",
    launchThreadId: "thread-1",
    host: fake.host,
    nowIso: () => clock[tick++] ?? clock.at(-1) ?? "2026-01-01T00:00:00.000Z",
  });
  const payloads = () =>
    fake.activities().map((activity) => activity.payload as Record<string, unknown>);
  return { emitter, fake, payloads };
}

describe("createWorkflowStepActivityEmitter", () => {
  it("stamps durationMs on a resolved step from its remembered start", async () => {
    // `nowIso()` is read twice: emitSent's step start and emitResolved's durationMs "now".
    const { emitter, fake, payloads } = makeEmitter([
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:02.500Z",
    ]);
    await emitter.emitSent({ correlationId: "run-1:1", stepKind: "thread.turn", phase: "started" });
    await emitter.emitResolved("run-1:1", "completed");

    expect(fake.activities().map((activity) => activity.id)).toEqual([
      "t3team-wf-step:run-1:1",
      "t3team-wf-step:run-1:1",
    ]);
    expect(fake.activities()[0]).toMatchObject({
      threadId: "thread-1",
      kind: "t3team.recipe.workflow.step",
      tone: "info",
    });
    expect(payloads()[0]?.durationMs).toBeUndefined();
    expect(payloads()[1]?.durationMs).toBe(2_500);
  });

  it("omits durationMs when a step resolves after a restart with no remembered start", async () => {
    const { emitter, payloads } = makeEmitter(["2026-01-01T00:00:05.000Z"]);
    // No emitSent call — simulates a rehydrated run resolving a step the process never sent
    // (the in-memory `sentByCorrelation` map is empty right after a restart).
    await emitter.emitResolved("run-1:1", "completed");
    expect(payloads()).toHaveLength(1);
    expect("durationMs" in payloads()[0]!).toBe(false);
  });

  it("marks a failed step's activity with the error tone", async () => {
    const { emitter, fake } = makeEmitter(["2026-01-01T00:00:00.000Z"]);
    await emitter.emitRun("failed", "boom");
    expect(fake.activities()[0]).toMatchObject({
      id: "t3team-wf-step:run-1:run",
      tone: "error",
      summary: "Workflow run failed",
      payload: { stepId: "run:run-1", phase: "failed", error: "boom" },
    });
  });
});
