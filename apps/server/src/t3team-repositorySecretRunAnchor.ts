/**
 * Pick or open a V2 run that can host a SecretRequestCard (latest active, else defer_start hold).
 *
 * @module t3team-repositorySecretRunAnchor
 */
import { CommandId, MessageId, type RunId, type ThreadId, type NodeId } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as Effect from "effect/Effect";

import * as ThreadManagementService from "./orchestration-v2/ThreadManagementService.ts";

export type SecretRequestRunAnchor = {
  readonly runId: RunId;
  readonly nodeId: NodeId;
  readonly holding: boolean;
};

/** Latest active run with a root node, or a short `defer_start` holding run (no model turn). */
export const ensureSecretRequestRun = Effect.fn("ensureSecretRequestRun")(function* (
  threadId: ThreadId,
): Effect.Effect<SecretRequestRunAnchor, string, ThreadManagementService.ThreadManagementService> {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const projection = yield* threads
    .getThreadRecords(threadId, ["runs"], { turnItemTypes: [], messageRoles: [] })
    .pipe(Effect.mapError((error): string => `Could not read thread runs: ${error.message}`));
  const active = ThreadManagementService.latestActiveRun(projection);
  if (active !== undefined && active.rootNodeId !== null) {
    return { runId: active.id, nodeId: active.rootNodeId, holding: false };
  }
  const messageId = MessageId.make(`msg:repo-secret:${NodeCrypto.randomUUID()}`);
  const commandId = CommandId.make(`command:repo-secret:hold:${NodeCrypto.randomUUID()}`);
  yield* threads
    .dispatch({
      type: "message.dispatch",
      commandId,
      threadId,
      messageId,
      text: "Waiting for a repository secret.",
      attachments: [],
      dispatchMode: { type: "defer_start" },
      createdBy: "system",
      creationSource: "server",
    })
    .pipe(
      Effect.mapError(
        (error): string => `Could not open a holding run for the secret card: ${error.message}`,
      ),
    );
  const after = yield* threads
    .getThreadRecords(threadId, ["runs"], { turnItemTypes: [], messageRoles: [] })
    .pipe(Effect.mapError((error): string => `Could not read the holding run: ${error.message}`));
  const holding = ThreadManagementService.latestActiveRun(after);
  if (holding === undefined || holding.rootNodeId === null) {
    return yield* Effect.fail("Opened a holding run for the secret card, but it has no root node.");
  }
  return { runId: holding.id, nodeId: holding.rootNodeId, holding: true };
});

export const releaseHoldingRun = (threadId: ThreadId, runId: RunId) =>
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService.ThreadManagementService;
    yield* threads
      .dispatch({
        type: "prepared-run.fail",
        commandId: CommandId.make(`command:repo-secret:hold-fail:${NodeCrypto.randomUUID()}`),
        threadId,
        runId,
        failure: {
          class: "unknown",
          message: "Repository secret prompt finished.",
          code: "repository_secret_hold_complete",
          retryable: false,
        },
      })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("Could not release repository-secret holding run", {
            error: error.message,
          }),
        ),
      );
  });
