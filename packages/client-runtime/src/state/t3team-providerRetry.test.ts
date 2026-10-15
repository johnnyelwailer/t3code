import {
  MessageId,
  NodeId,
  RunId,
  TurnItemId,
  type OrchestrationV2ProviderFailure,
  type OrchestrationV2RunStatus,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItemStatus,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { v2Projection } from "./orchestrationV2TestFixtures.ts";
import {
  deriveActiveProviderRetry,
  deriveTransientFailureRecovery,
} from "./t3team-providerRetry.ts";

const at = (seconds: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 11, 10, 0, seconds));

function run(id: string, ordinal: number, status: OrchestrationV2RunStatus) {
  return {
    id: RunId.make(id),
    threadId: v2Projection.thread.id,
    ordinal,
    providerInstanceId: v2Projection.thread.providerInstanceId,
    modelSelection: v2Projection.thread.modelSelection,
    providerThreadId: null,
    userMessageId: MessageId.make(`message-${id}`),
    rootNodeId: NodeId.make(`root-${id}`),
    activeAttemptId: null,
    status,
    requestedAt: at(0),
    startedAt: at(0),
    completedAt: status === "failed" ? at(30) : null,
    checkpointId: null,
    contextHandoffId: null,
  };
}

const timeout: OrchestrationV2ProviderFailure = {
  class: "transport_error",
  message: "Gateway timeout (504)",
  code: null,
  retryable: true,
};

function errorItem(
  id: string,
  runId: string,
  status: OrchestrationV2TurnItemStatus,
  updatedAt: DateTime.Utc,
  options: {
    readonly attempt?: number;
    readonly failure?: OrchestrationV2ProviderFailure;
  } = {},
) {
  return {
    id: TurnItemId.make(id),
    threadId: v2Projection.thread.id,
    runId: RunId.make(runId),
    nodeId: NodeId.make(`root-${runId}`),
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    type: "error" as const,
    status,
    title: null,
    startedAt: at(0),
    completedAt: null,
    updatedAt,
    failure: options.failure ?? timeout,
    ...(options.attempt === undefined
      ? {}
      : { retry: { attempt: options.attempt, maxAttempts: 5, retryDelayMs: 4_000 } }),
  };
}

function projection(
  runs: ReadonlyArray<ReturnType<typeof run>>,
  turnItems: ReadonlyArray<ReturnType<typeof errorItem>>,
  thread: Partial<OrchestrationV2ThreadProjection["thread"]> = {},
): OrchestrationV2ThreadProjection {
  return { ...v2Projection, thread: { ...v2Projection.thread, ...thread }, runs, turnItems };
}

describe("deriveActiveProviderRetry", () => {
  it("reports the newest running retry of the live run, labelled by provider", () => {
    const retry = deriveActiveProviderRetry(
      projection(
        [run("live", 1, "running")],
        [
          errorItem("older", "live", "running", at(1), { attempt: 1 }),
          errorItem("newer", "live", "running", at(5), { attempt: 2 }),
        ],
      ),
    );
    expect(retry).toEqual({
      itemId: "newer",
      attempt: 2,
      maxAttempts: 5,
      retryDelayMs: 4_000,
      updatedAt: DateTime.formatIso(at(5)),
      cause: "Gateway timeout (504)",
      providerLabel: "Codex",
    });
  });

  it("disappears once the retry recovered or the run settled", () => {
    const recovered = projection(
      [run("live", 1, "running")],
      [errorItem("item", "live", "completed", at(5), { attempt: 2 })],
    );
    expect(deriveActiveProviderRetry(recovered)).toBeNull();
    const failed = projection(
      [run("done", 1, "failed")],
      [errorItem("item", "done", "running", at(5), { attempt: 2 })],
    );
    expect(deriveActiveProviderRetry(failed)).toBeNull();
  });

  it("ignores error items without retry progress", () => {
    const plain = projection(
      [run("live", 1, "running")],
      [errorItem("item", "live", "running", at(5))],
    );
    expect(deriveActiveProviderRetry(plain)).toBeNull();
  });
});

describe("deriveTransientFailureRecovery", () => {
  it("reports a transient failure of the latest run with the recovery armed for that run", () => {
    const recovery = {
      runId: RunId.make("failed"),
      nextTryAt: "2026-10-11T10:05:00.000Z",
      autoResume: true,
    };
    const derived = deriveTransientFailureRecovery(
      projection([run("failed", 1, "failed")], [errorItem("error", "failed", "failed", at(30))], {
        transientRecovery: recovery,
      }),
    );
    expect(derived).toEqual({
      runId: "failed",
      cause: "Gateway timeout (504)",
      providerLabel: "Codex",
      recovery,
    });
  });

  it("drops a recovery armed for an earlier run", () => {
    const derived = deriveTransientFailureRecovery(
      projection(
        [run("first", 1, "failed"), run("second", 2, "failed")],
        [errorItem("error", "second", "failed", at(30))],
        { transientRecovery: { runId: RunId.make("first"), nextTryAt: null, autoResume: false } },
      ),
    );
    expect(derived?.runId).toBe("second");
    expect(derived?.recovery).toBeNull();
  });

  it("is null for a non-transient failure the host never armed, and for a live run", () => {
    const usageLimit = projection(
      [run("failed", 1, "failed")],
      [
        errorItem("error", "failed", "failed", at(30), {
          failure: { class: "usage_limit", message: "Plan limit", code: null, retryable: false },
        }),
      ],
    );
    expect(deriveTransientFailureRecovery(usageLimit)).toBeNull();
    const live = projection([run("live", 1, "running")], []);
    expect(deriveTransientFailureRecovery(live)).toBeNull();
  });

  it("accepts any failure class once the host armed a recovery for the run", () => {
    const derived = deriveTransientFailureRecovery(
      projection(
        [run("failed", 1, "failed")],
        [
          errorItem("error", "failed", "failed", at(30), {
            failure: { class: "provider_error", message: "503", code: null, retryable: true },
          }),
        ],
        { transientRecovery: { runId: RunId.make("failed"), nextTryAt: null, autoResume: true } },
      ),
    );
    expect(derived?.cause).toBe("503");
  });
});
