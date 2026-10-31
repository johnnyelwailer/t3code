/**
 * POST /api/t3team/thread/view-context — the web publishes what the user is looking at for the
 * thread opened beside the view. `viewContext: null` clears it. Read back by `t3_view_read`.
 */
import { T3TeamThreadViewContextPublication } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRouter } from "effect/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { whenRouteFeatureEnabled } from "./t3team-featureFlagRoute.ts";
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
        return badRequestJson("A thread id and a view context (or null) are required.");
      }
      yield* store.putViewContext({
        threadId: publication.value.threadId,
        viewContext: publication.value.viewContext,
        nowMs: yield* Clock.currentTimeMillis,
      });
      return okJson({ ok: true });
    }).pipe(Effect.catch(errorResponse)),
  ),
);
