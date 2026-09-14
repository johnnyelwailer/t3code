/**
 * `emitResolved` stamps `durationMs` from the step's remembered start (see the doc on
 * `SentStepRecord` and on `ProjectRecipeWorkflowStepActivityPayload.durationMs`), and MUST omit
 * it — never guess or zero it — when that start was never remembered: the initial (non-terminal)
 * emission, and a resolve after a server restart (`sentByCorrelation` is process-local and empty).
 */
import type { OrchestrationCommand } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createWorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

function activityPayload(command: OrchestrationCommand | undefined): Record<string, unknown> {
  if (command === undefined || command.type !== "thread.activity.append") {
    throw new Error(`expected a thread.activity.append command, got ${command?.type}`);
  }
  return command.activity.payload as Record<string, unknown>;
}

function makeEmitter(opts: {
  readonly dispatched: OrchestrationCommand[];
  readonly clock: ReadonlyArray<string>;
}) {
  let tick = 0;
  return createWorkflowStepActivityEmitter({
    runId: "run-1",
    projectId: "project-1",
    launchThreadId: "thread-1",
    dispatch: async (command) => void opts.dispatched.push(command),
    newId: () => `id-${opts.dispatched.length}`,
    nowIso: () => opts.clock[tick++] ?? opts.clock.at(-1) ?? "2026-01-01T00:00:00.000Z",
  });
}

describe("createWorkflowStepActivityEmitter", () => {
  it("stamps durationMs on a resolved step from its remembered start", async () => {
    const dispatched: OrchestrationCommand[] = [];
    // `nowIso()` is read four times: emitSent's step-start record, emitSent's dispatch-envelope
    // createdAt, emitResolved's durationMs "now", and emitResolved's dispatch-envelope createdAt.
    const emitter = makeEmitter({
      dispatched,
      clock: [
        "2026-01-01T00:00:00.000Z", // emitSent: step start
        "2026-01-01T00:00:00.100Z", // emitSent: dispatch envelope createdAt (irrelevant here)
        "2026-01-01T00:00:02.500Z", // emitResolved: durationMs "now" -> 2500ms elapsed
        "2026-01-01T00:00:02.600Z", // emitResolved: dispatch envelope createdAt (irrelevant here)
      ],
    });

    await emitter.emitSent({
      correlationId: "run-1:1",
      stepKind: "thread.turn",
      phase: "started",
    });
    await emitter.emitResolved("run-1:1", "completed");

    expect(dispatched).toHaveLength(2);
    const sentPayload = activityPayload(dispatched[0]);
    expect(sentPayload.durationMs).toBeUndefined();

    const resolvedPayload = activityPayload(dispatched[1]);
    expect(resolvedPayload.durationMs).toBe(2_500);
  });

  it("omits durationMs when a step resolves after a restart with no remembered start", async () => {
    const dispatched: OrchestrationCommand[] = [];
    const emitter = makeEmitter({
      dispatched,
      clock: ["2026-01-01T00:00:05.000Z", "2026-01-01T00:00:05.001Z"],
    });

    // No emitSent call — simulates a rehydrated run resolving a step the process never sent
    // (the in-memory `sentByCorrelation` map is empty right after a restart).
    await emitter.emitResolved("run-1:1", "completed");

    expect(dispatched).toHaveLength(1);
    const payload = activityPayload(dispatched[0]);
    expect("durationMs" in payload).toBe(false);
  });
});
