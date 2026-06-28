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
import { maybeBindT3workBrokerForProviderThread } from "./t3work-mcpBindSession.ts";
import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";

type T3workThreadToolContextSyncRequest = {
  readonly threadId?: string;
  readonly toolContext?: T3workTurnToolContext | null;
};

export const t3workThreadToolContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/thread/tool-context",
  Effect.gen(function* () {
    const store = yield* T3workThreadToolContextStore;
    const input = yield* readJsonBody<T3workThreadToolContextSyncRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    if (threadIdInput.length === 0) {
      return yield* new T3workAtlassianError({ message: "threadId is required." });
    }

    yield* store.put({
      threadId: ThreadId.make(threadIdInput),
      ...(input.toolContext !== undefined ? { toolContext: input.toolContext } : {}),
    });
    yield* maybeBindT3workBrokerForProviderThread(ThreadId.make(threadIdInput));

    return okJson({ ok: true });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to sync thread tool context.")),
    Effect.catch(errorResponse),
  ),
);
