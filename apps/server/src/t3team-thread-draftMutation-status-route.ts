/**
 * Record a reviewer's verdict on a proposed draft, durably.
 *
 * Shaped after `t3team-thread-recipe-workflow-routes-resolve.ts` — the sanctioned pattern for a
 * client action that has to become thread state: a small POST route that dispatches ONE
 * `thread.message.upsert` through the orchestration engine. No new command type, no draft table, no
 * second channel; the carrier that delivered the proposal is the record that keeps its verdict.
 *
 * The payload is read from the PROJECTION, not from the request: the caller sends ids and a status,
 * so a client cannot rewrite the patch it is accepting while marking it applied.
 */

import { CommandId, MessageId, type T3TeamDraftMutationStatus, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/unstable/http";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import {
  carrierMessageIdFromDraftId,
  withDraftMutationStatus,
} from "./t3team-draftMutationStatus.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const STATUSES: ReadonlySet<string> = new Set(["draft", "applied", "dismissed"]);

export interface T3TeamDraftMutationStatusInput {
  readonly threadId?: string;
  /** The draft id the client keys by (`jira-draft:<messageId>`), or the carrier id itself. */
  readonly draftId?: string;
  readonly carrierMessageId?: string;
  readonly status?: string;
}

/**
 * Set a carrier's draft status. Fails with a sentence naming the cause — a verdict that silently
 * did not persist is the bug this slice exists to remove, so nothing here is best-effort.
 */
export const setT3TeamDraftMutationStatus = Effect.fn("setT3TeamDraftMutationStatus")(function* (
  input: T3TeamDraftMutationStatusInput,
) {
  const threadId = input.threadId?.trim() ?? "";
  if (threadId.length === 0) {
    return yield* new T3TeamAtlassianError({ message: "threadId is required." });
  }
  const status = input.status?.trim() ?? "";
  if (!STATUSES.has(status)) {
    return yield* new T3TeamAtlassianError({
      message: "status must be one of draft, applied, dismissed.",
    });
  }
  const carrierMessageId = carrierMessageIdFromDraftId(
    input.draftId ?? input.carrierMessageId ?? "",
  );
  if (carrierMessageId === undefined) {
    return yield* new T3TeamAtlassianError({ message: "draftId or carrierMessageId is required." });
  }

  const query = yield* ProjectionSnapshotQuery;
  const thread = Option.getOrUndefined(yield* query.getThreadDetailById(ThreadId.make(threadId)));
  if (thread === undefined) {
    return yield* new T3TeamAtlassianError({ message: `Thread ${threadId} was not found.` });
  }
  const carrier = thread.messages.find((message) => message.id === carrierMessageId);
  if (carrier === undefined) {
    return yield* new T3TeamAtlassianError({
      message: `No draft carrier '${carrierMessageId}' on thread ${threadId}.`,
    });
  }
  const t3teamExt = withDraftMutationStatus(carrier.t3teamExt, status as T3TeamDraftMutationStatus);
  if (t3teamExt === undefined) {
    return yield* new T3TeamAtlassianError({
      message: `Message '${carrierMessageId}' carries no proposed draft.`,
    });
  }

  const orchestration = yield* OrchestrationEngineService;
  yield* orchestration.dispatch({
    type: "thread.message.upsert",
    commandId: CommandId.make(`server:t3team:draft-status:${t3teamRandomUUID()}`),
    threadId: ThreadId.make(threadId),
    // Same message id — this UPDATES the carrier in place. Role/text/flags are carried over from
    // what was published, so the carrier stays hidden and does not appear as chat.
    message: {
      messageId: MessageId.make(carrierMessageId),
      role: carrier.role,
      text: carrier.text,
      turnId: carrier.turnId,
      streaming: false,
      t3teamExt,
    },
    createdAt: DateTime.formatIso(yield* DateTime.now),
  });

  return { draftId: `jira-draft:${carrierMessageId}`, status } as const;
});

export const t3teamThreadDraftMutationStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/draft-mutation/status",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamDraftMutationStatusInput>();
    const result = yield* setT3TeamDraftMutationStatus(input);
    return okJson({ ok: true, ...result });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to record the draft verdict.")),
    Effect.catch(errorResponse),
  ),
);
