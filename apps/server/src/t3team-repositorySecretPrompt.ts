/**
 * Dock a masked SecretRequestCard on a thread run, wait for the user, consume the one-use ref.
 * The plaintext leaves this module only on the Effect success channel for the publisher that
 * pipes it to `gh secret set` on stdin.
 *
 * @module t3team-repositorySecretPrompt
 */
import { CommandId, type ProjectId, type ThreadId, TurnItemId } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";
import * as SecretRequests from "./secrets/SecretRequests.ts";
import { ensureSecretRequestRun, releaseHoldingRun } from "./t3team-repositorySecretRunAnchor.ts";

const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_WAIT_TIMEOUT_MS = 60 * 60 * 1_000;
const POLL_MS = 500;

export type RepositorySecretPromptResult =
  | { readonly status: "saved"; readonly value: string }
  | {
      readonly status: "declined" | "cancelled" | "timed_out" | "unavailable";
      readonly detail: string;
    };

const stablePart = (value: string) => encodeURIComponent(value);

/** Docks the card, waits, consumes the value when saved. */
export const promptRepositorySecret = Effect.fn("promptRepositorySecret")(function* (input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly label: string;
  readonly reason: string;
  readonly placeholder?: string;
  readonly timeoutMs?: number;
  readonly clientRequestId?: string;
}) {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const secretRequests = yield* SecretRequests.SecretRequests;
  const runAnchor = yield* ensureSecretRequestRun(input.threadId).pipe(Effect.result);
  if (runAnchor._tag === "Failure") {
    return {
      status: "unavailable" as const,
      detail: runAnchor.failure,
    } satisfies RepositorySecretPromptResult;
  }
  const { runId, nodeId, holding } = runAnchor.success;
  const finish = <A>(result: A) =>
    (holding ? releaseHoldingRun(input.threadId, runId) : Effect.void).pipe(
      Effect.zipRight(Effect.succeed(result)),
    );

  const key = input.clientRequestId?.trim() || NodeCrypto.randomUUID();
  const turnItemId = TurnItemId.make(
    `turn-item:secret-request:${stablePart(input.threadId)}:${stablePart(key)}`,
  );
  const record = (secretStatus: "pending" | "cancelled") =>
    threads
      .dispatch({
        type: "secret_request.record",
        commandId: CommandId.make(
          `command:repo-secret:${secretStatus}:${stablePart(input.threadId)}:${stablePart(key)}`,
        ),
        threadId: input.threadId,
        runId,
        nodeId,
        turnItemId,
        label: input.label,
        reason: input.reason,
        ...(input.placeholder === undefined ? {} : { placeholder: input.placeholder }),
        secretStatus,
      })
      .pipe(
        Effect.mapError((error): string => `Could not record the secret request: ${error.message}`),
      );

  const recorded = yield* record("pending").pipe(Effect.result);
  if (recorded._tag === "Failure") {
    return yield* finish({
      status: "unavailable" as const,
      detail: recorded.failure,
    } satisfies RepositorySecretPromptResult);
  }

  const closeCard = record("cancelled").pipe(
    Effect.catch((error) =>
      Effect.logWarning("Could not close a repository-secret request card", {
        error: error.message,
      }),
    ),
  );

  const answered = yield* Effect.gen(function* () {
    while (true) {
      const projection = yield* threads
        .getThreadRecords(input.threadId, ["runs", "turnItems"], {
          turnItemTypes: ["secret_request"],
          messageRoles: [],
        })
        .pipe(
          Effect.mapError((error): string => `Unable to read the secret request: ${error.message}`),
        );
      const item = projection.turnItems.find((candidate) => candidate.id === turnItemId);
      if (item?.type === "secret_request" && item.secretStatus !== "pending") {
        return item.secretStatus;
      }
      const current = projection.runs.find((candidate) => candidate.id === runId);
      if (current === undefined || ThreadManagementService.isTerminalRunStatus(current.status)) {
        yield* record("cancelled");
        return "cancelled" as const;
      }
      yield* Effect.sleep(Duration.millis(POLL_MS));
    }
  }).pipe(
    Effect.timeoutOption(
      Duration.millis(Math.min(input.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS)),
    ),
    Effect.onExit((exit) => (Exit.isSuccess(exit) ? Effect.void : closeCard)),
  );

  if (Option.isNone(answered)) yield* closeCard;
  const status = Option.isSome(answered)
    ? answered.value
    : yield* threads
        .getThreadRecords(input.threadId, ["turnItems"], {
          turnItemTypes: ["secret_request"],
          messageRoles: [],
        })
        .pipe(
          Effect.map((records) => {
            const item = records.turnItems.find((candidate) => candidate.id === turnItemId);
            return item?.type === "secret_request" &&
              (item.secretStatus === "saved" || item.secretStatus === "declined")
              ? item.secretStatus
              : ("timed_out" as const);
          }),
          Effect.orElseSucceed(() => "timed_out" as const),
        );

  if (status !== "saved") {
    return yield* finish({
      status:
        status === "declined" ? "declined" : status === "timed_out" ? "timed_out" : "cancelled",
      detail:
        status === "declined"
          ? "The user declined to save the secret."
          : status === "timed_out"
            ? "Timed out waiting for the secret."
            : "The secret request was cancelled.",
    } satisfies RepositorySecretPromptResult);
  }

  const secretRef = yield* secretRequests.savedRef({
    threadId: input.threadId,
    turnItemId,
  });
  if (Option.isNone(secretRef)) {
    return yield* finish({
      status: "unavailable" as const,
      detail: "The user saved the secret, but it could not be read. Try again.",
    } satisfies RepositorySecretPromptResult);
  }
  const value = yield* secretRequests
    .consume({ ref: secretRef.value, projectId: input.projectId })
    .pipe(
      Effect.mapError((error): string => `Could not read the saved secret: ${error.message}`),
      Effect.result,
    );
  if (value._tag === "Failure") {
    return yield* finish({
      status: "unavailable" as const,
      detail: value.failure,
    } satisfies RepositorySecretPromptResult);
  }
  return yield* finish({
    status: "saved" as const,
    value: value.success,
  } satisfies RepositorySecretPromptResult);
});
