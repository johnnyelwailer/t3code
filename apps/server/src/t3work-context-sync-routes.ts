import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3workAtlassianError,
  toAtlassianError,
} from "./t3work-atlassian-http.ts";
import { T3workContextSyncQueue } from "./t3work-contextSyncQueue.ts";

type ListContextSyncQueueRequest = {
  readonly threadId?: string;
};

type CompleteContextSyncRequest = {
  readonly threadId?: string;
  readonly requestId?: string;
};

export const t3workContextSyncQueueRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-sync/queue",
  Effect.gen(function* () {
    const queue = yield* T3workContextSyncQueue;
    const input = yield* readJsonBody<ListContextSyncQueueRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    if (threadIdInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "threadId is required." });
    }

    const requests = yield* queue.listPendingForThread(ThreadId.make(threadIdInput));
    return okJson({ requests });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to list context sync queue.")),
    Effect.catch(errorResponse),
  ),
);

export const t3workContextSyncCompleteRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/project/workspace/context-sync/complete",
  Effect.gen(function* () {
    const queue = yield* T3workContextSyncQueue;
    const input = yield* readJsonBody<CompleteContextSyncRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    const requestId = input.requestId?.trim() ?? "";
    if (threadIdInput.length === 0 || requestId.length === 0) {
      return yield* new T3workAtlassianError({
        message: "threadId and requestId are required.",
      });
    }

    const completed = yield* queue.complete({
      threadId: ThreadId.make(threadIdInput),
      requestId,
    });
    return okJson({ ok: completed });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to complete context sync request.")),
    Effect.catch(errorResponse),
  ),
);
