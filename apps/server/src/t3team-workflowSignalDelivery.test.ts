/**
 * Unit tests for the signal delivery port CORE (`makeSignalDeliveryPort`) — the fan-out /
 * orphan / inbox-bridge logic with fakes and no database (GHE #332 review): the most
 * safety-critical new module, previously untested.
 *
 *   1. FAN-OUT — a delivery wakes every `watching` run parked on the exact tuple, and only
 *      those; it never touches the inbox when a run is parked.
 *   2. INBOX BRIDGE — no parked run → the event is written to the durable inbox (first-wins
 *      bridge), not dropped.
 *   3. ORPHAN WHILE REHYDRATE IN FLIGHT — a parked row whose controller is not registered yet,
 *      with the boot-rehydration gate open, is left PARKED (retry on the next event), not
 *      failed.
 *   4. ORPHAN AFTER REHYDRATE — the same situation with the gate closed marks the run failed
 *      (`signal.wait` step) instead of parking it forever.
 *   5. AT-LEAST-ONCE — a failed resume FAILS the emit, so the source's poller holds its
 *      durable cursor and redelivers next tick.
 */

import { assert, describe, it } from "@effect/vitest";
import { assertInstanceOf } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";

import { PersistenceSqlError } from "./persistence/Errors.ts";
import type {
  ClearWorkflowRunPendingInput,
  WorkflowRun,
} from "./persistence/Services/WorkflowRuns.ts";
import type { InsertSignalInboxEntryInput } from "./persistence/Services/WorkflowSignalStore.ts";
import type { WorkflowRegisteredRun } from "./t3team-workflowEngineRegistry.ts";
import {
  makeSignalDeliveryPort,
  type SignalDeliveryInput,
} from "./t3team-workflowSignalDelivery.ts";

const NOW = "2026-09-20T00:00:00.000Z";

const row = (over: Partial<WorkflowRun>): WorkflowRun => over as unknown as WorkflowRun;

interface FakeController {
  readonly resumes: Array<{ correlationId: string; payload: unknown }>;
  resume: (correlationId: string, payload: unknown) => Promise<void>;
}

function makeController(behavior: "ok" | "fail" = "ok"): FakeController {
  const controller: FakeController = {
    resumes: [],
    resume: async (correlationId, payload) => {
      if (behavior === "fail") throw new Error("journal write failed (transient)");
      controller.resumes.push({ correlationId, payload });
    },
  };
  return controller;
}

const baseInput: Omit<SignalDeliveryInput, "payload"> = {
  sourceName: "scm.change-request.watch",
  paramsHash: "hash-42",
  signalName: "scm.change-request.merged",
  key: "42",
};

describe("makeSignalDeliveryPort", () => {
  it("fans out to every parked run on the exact tuple, not to others", async () => {
    const parkedA = row({
      runId: "run-a",
      pendingCorrelationId: "corr-a",
      watchSourceName: "scm.change-request.watch",
      watchParamsHash: "hash-42",
      watchSignalName: "scm.change-request.merged",
      watchSignalKey: "42",
    });
    const parkedB = row({
      runId: "run-b",
      pendingCorrelationId: "corr-b",
      watchSourceName: "scm.change-request.watch",
      watchParamsHash: "hash-42",
      watchSignalName: "scm.change-request.merged",
      watchSignalKey: "42",
    });
    // Same source/params, different awaited signal — must NOT be woken by this event.
    const parkedOtherSignal = row({
      runId: "run-c",
      pendingCorrelationId: "corr-c",
      watchSourceName: "scm.change-request.watch",
      watchParamsHash: "hash-42",
      watchSignalName: "scm.change-request.closed",
      watchSignalKey: "42",
    });
    // Same tuple shape but a different instance (params hash) — must NOT be woken.
    const parkedOtherInstance = row({
      runId: "run-d",
      pendingCorrelationId: "corr-d",
      watchSourceName: "scm.change-request.watch",
      watchParamsHash: "hash-999",
      watchSignalName: "scm.change-request.merged",
      watchSignalKey: "42",
    });
    const controllers = new Map<string, FakeController>([
      ["run-a", makeController()],
      ["run-b", makeController()],
      ["run-c", makeController()],
      ["run-d", makeController()],
    ]);
    const inserted: InsertSignalInboxEntryInput[] = [];
    const port = makeSignalDeliveryPort({
      repo: {
        listByStatus: () =>
          Effect.succeed([parkedA, parkedB, parkedOtherSignal, parkedOtherInstance]),
        clearPending: () => Effect.succeed(undefined),
      },
      store: {
        insertInboxEntry: (input) => {
          inserted.push(input);
          return Effect.succeed(1);
        },
      },
      registry: {
        getRun: (runId) =>
          controllers.get(runId) as unknown as WorkflowRegisteredRun | undefined,
      },
      nowIso: () => NOW,
    });

    const payload = { changeRequest: { title: "Fix the billing path" } };
    const woken = await Effect.runPromise(port.emit({ ...baseInput, payload }));
    assert.strictEqual(woken, 2);
    const controllerA = controllers.get("run-a");
    const controllerB = controllers.get("run-b");
    assert.strictEqual(controllerA?.resumes.length, 1);
    assert.strictEqual(controllerA?.resumes[0]?.correlationId, "corr-a");
    assert.deepStrictEqual(controllerA?.resumes[0]?.payload, payload);
    assert.strictEqual(controllerB?.resumes[0]?.correlationId, "corr-b");
    // The off-tuple runs are untouched:
    assert.strictEqual(controllers.get("run-c")?.resumes.length, 0);
    assert.strictEqual(controllers.get("run-d")?.resumes.length, 0);
    // A parked run consumed the event — nothing goes to the inbox:
    assert.strictEqual(inserted.length, 0);
  });

  it("bridges to the durable inbox when no run is parked on the tuple", async () => {
    const parkedElsewhere = row({
      runId: "run-x",
      pendingCorrelationId: "corr-x",
      watchSourceName: "work-item.updates",
      watchParamsHash: "hash-wi",
      watchSignalName: "work-item.updated",
      watchSignalKey: "SVC-7",
    });
    const inserted: InsertSignalInboxEntryInput[] = [];
    const port = makeSignalDeliveryPort({
      repo: {
        listByStatus: () => Effect.succeed([parkedElsewhere]),
        clearPending: () => Effect.succeed(undefined),
      },
      store: {
        insertInboxEntry: (input) => {
          inserted.push(input);
          return Effect.succeed(1);
        },
      },
      registry: { getRun: () => undefined },
      nowIso: () => NOW,
    });

    const payload = { changeRequest: { title: "Fix the billing path" } };
    const woken = await Effect.runPromise(port.emit({ ...baseInput, payload }));
    assert.strictEqual(woken, 0);
    assert.strictEqual(inserted.length, 1);
    assert.deepStrictEqual(inserted[0], {
      sourceName: baseInput.sourceName,
      paramsHash: baseInput.paramsHash,
      signalName: baseInput.signalName,
      key: baseInput.key,
      payload,
      createdAt: NOW,
    });
  });

  it("leaves a parked run parked while boot rehydration is in flight, and orphans it after", async () => {
    const parked = row({
      runId: "run-pending-rehydrate",
      pendingCorrelationId: "corr-p",
      watchSourceName: baseInput.sourceName,
      watchParamsHash: baseInput.paramsHash,
      watchSignalName: baseInput.signalName,
      watchSignalKey: baseInput.key,
    });
    const cleared: ClearWorkflowRunPendingInput[] = [];
    let inFlight = true;
    const port = makeSignalDeliveryPort({
      repo: {
        listByStatus: () => Effect.succeed([parked]),
        clearPending: (input) => {
          cleared.push(input);
          return Effect.succeed(undefined);
        },
      },
      store: { insertInboxEntry: () => Effect.succeed(1) },
      registry: { getRun: () => undefined },
      isRehydrateInFlight: () => inFlight,
      nowIso: () => NOW,
    });

    // Rehydration in flight: the event arrives, the controller is not registered yet — the run
    // must stay parked (the next event retries), NOT be failed.
    const woken = await Effect.runPromise(port.emit({ ...baseInput, payload: {} }));
    assert.strictEqual(woken, 0);
    assert.strictEqual(cleared.length, 0);

    // …and once rehydration completes, the SAME situation orphan-fails the run:
    inFlight = false;
    await Effect.runPromise(port.emit({ ...baseInput, payload: {} }));
    assert.strictEqual(cleared.length, 1);
    assert.strictEqual(cleared[0]!.status, "failed");
    assert.strictEqual(cleared[0]!.failureStep, "signal.wait");
    assert.strictEqual(cleared[0]!.runId, "run-pending-rehydrate");
  });

  it("orphan-fails a parked run when no controller exists and no gate is present", async () => {
    const parked = row({
      runId: "run-orphan",
      pendingCorrelationId: "corr-o",
      watchSourceName: baseInput.sourceName,
      watchParamsHash: baseInput.paramsHash,
      watchSignalName: baseInput.signalName,
      watchSignalKey: baseInput.key,
    });
    const cleared: ClearWorkflowRunPendingInput[] = [];
    const port = makeSignalDeliveryPort({
      repo: {
        listByStatus: () => Effect.succeed([parked]),
        clearPending: (input) => {
          cleared.push(input);
          return Effect.succeed(undefined);
        },
      },
      store: { insertInboxEntry: () => Effect.succeed(1) },
      registry: { getRun: () => undefined },
      nowIso: () => NOW,
    });

    await Effect.runPromise(port.emit({ ...baseInput, payload: {} }));
    assert.strictEqual(cleared.length, 1);
    assert.strictEqual(cleared[0]!.status, "failed");
    assert.strictEqual(cleared[0]!.failureStep, "signal.wait");
  });

  it("fails the emit when a resume fails, so the poller holds its cursor for redelivery", async () => {
    const parked = row({
      runId: "run-failing-resume",
      pendingCorrelationId: "corr-f",
      watchSourceName: baseInput.sourceName,
      watchParamsHash: baseInput.paramsHash,
      watchSignalName: baseInput.signalName,
      watchSignalKey: baseInput.key,
    });
    const port = makeSignalDeliveryPort({
      repo: {
        listByStatus: () => Effect.succeed([parked]),
        clearPending: () => Effect.succeed(undefined),
      },
      store: { insertInboxEntry: () => Effect.succeed(1) },
      registry: {
        getRun: () => makeController("fail") as unknown as WorkflowRegisteredRun,
      },
      nowIso: () => NOW,
    });

    const error = await Effect.runPromise(port.emit({ ...baseInput, payload: {} })).then(
      (woken) => {
        throw new Error(`emit unexpectedly succeeded: woken ${woken}`);
      },
      (cause) => cause,
    );
    assertInstanceOf(error, PersistenceSqlError);
    assert.strictEqual(error.operation, "workflowSignal.resume");
  });
});
