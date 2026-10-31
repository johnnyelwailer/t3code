/**
 * POST /api/t3team/thread/view-context — the web publishes what the user is looking at for the
 * thread opened beside the view. `viewContext: null` clears it. Read back by `t3_view_read`.
 * The thread is resolved server-side (same read as the workflow routes) and the context must be
 * for that thread's own project; a stale `sequence` is ignored.
 */
import { T3TeamThreadViewContextPublication } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { whenRouteFeatureEnabled } from "./t3team-featureFlagRoute.ts";
import { loadThreadProjectContext } from "./t3team-thread-recipe-workflow-routes-shared.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

const decodePublication = Schema.decodeUnknownEffect(T3TeamThreadViewContextPublication);

export const t3teamThreadViewContextRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/view-context",
  whenRouteFeatureEnabled(
    "AGENTS_VIEW_CONTEXT",
    Effect.gen(function* () {
      const store = yield* T3TeamThreadToolContextStore;
      const body = yield* readJsonBody<unknown>();
      const publication = yield* decodePublication(body).pipe(Effect.option);
      if (publication._tag === "None") {
        return badRequestJson("A thread id, a sequence and a view context (or null) are required.");
      }
      const { threadId, sequence, viewContext } = publication.value;
      const resolved = yield* loadThreadProjectContext(threadId).pipe(Effect.option);
      if (resolved._tag === "None") {
        return HttpServerResponse.jsonUnsafe({ error: "Thread not found." }, { status: 404 });
      }
      if (viewContext !== null && viewContext.projectId !== resolved.value.project.id) {
        return badRequestJson("The view context is for another project than the thread's.");
      }
      const outcome = yield* store.putViewContext({
        threadId,
        viewContext,
        sequence,
        nowMs: yield* Clock.currentTimeMillis,
      });
      return outcome === "thread-deleted"
        ? HttpServerResponse.jsonUnsafe({ error: "Thread not found." }, { status: 404 })
        : okJson({ ok: true, stored: outcome === "stored" });
    }).pipe(Effect.catch(errorResponse)),
  ),
);
