/**
 * Routes for the My Work Digest graph:
 *
 *   POST /api/t3team/mywork-digest/graph   — the aggregated read
 *   POST /api/t3team/mywork-digest/graph/poll — same read + the fingerprint
 *                                               envelope (`unchanged` short-circuit)
 *
 * Both answer with one payload: tickets, claims, decisions, change requests,
 * transitions, and sprint per scoped project — the data layer behind
 * `useMyWorkDigestGraph`.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { loadT3TeamMyWorkDigestGraph } from "./t3team-myworkDigest.ts";
import { toT3TeamPollResult } from "./t3team-integration-polling.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPollInput,
} from "./t3team-myworkDigestTypes.ts";

const t3teamMyWorkDigestGraphRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/graph",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamMyWorkDigestInput>();
    const payload = yield* loadT3TeamMyWorkDigestGraph(input);
    return okJson({ payload });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamMyWorkDigestGraphPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/graph/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamMyWorkDigestPollInput>();
    const payload = yield* loadT3TeamMyWorkDigestGraph(input);
    return okJson(toT3TeamPollResult(payload, input.poll));
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamMyWorkDigestRouteLayer = Layer.mergeAll(
  t3teamMyWorkDigestGraphRouteLayer,
  t3teamMyWorkDigestGraphPollRouteLayer,
);
