/**
 * POST /api/t3team/mywork-digest/arrangement/reset — drop the viewer's stored arrangement for a
 * scope, back to the client's heuristic default. The body is the graph route's input (scope +
 * projects), so viewer identity and scope key resolve exactly as they do for the digest read.
 */

import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { badRequestJson, errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { clearDigestArrangement, digestArrangementKey } from "./t3team-myworkDigestArrangement.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

export const t3teamMyWorkDigestArrangementRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/arrangement/reset",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamMyWorkDigestInput>();
    const key = digestArrangementKey(input);
    if (key === undefined) {
      return badRequestJson("Cannot resolve a viewer and scope for this arrangement.");
    }
    yield* clearDigestArrangement(key.identity, key.scope);
    return okJson({ ok: true });
  }).pipe(Effect.catch(errorResponse)),
);
