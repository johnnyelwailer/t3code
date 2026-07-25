import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
  toAtlassianError,
} from "./t3team-atlassian-http.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

type T3TeamThreadToolContextSyncRequest = {
  readonly threadId?: string;
  readonly toolContext?: T3TeamTurnToolContext | null;
};

export const t3teamThreadToolContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/tool-context",
  Effect.gen(function* () {
    const store = yield* T3TeamThreadToolContextStore;
    const input = yield* readJsonBody<T3TeamThreadToolContextSyncRequest>();
    const threadIdInput = input.threadId?.trim() ?? "";
    if (threadIdInput.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "threadId is required." });
    }

    yield* store.put({
      threadId: ThreadId.make(threadIdInput),
      ...(input.toolContext !== undefined ? { toolContext: input.toolContext } : {}),
    });

    return okJson({ ok: true });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to sync thread tool context.")),
    Effect.catch(errorResponse),
  ),
);
