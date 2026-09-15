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
 *
 * The poll route also owns the digest's visit receipt (t3team-myworkDigestLastVisit):
 * a changed round is a "visit". The fingerprint envelope is computed WITHOUT the
 * receipt, and the previous receipt is stamped into the payload only on changed
 * rounds — so a stable digest keeps short-circuiting even while the receipt itself
 * moves.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { loadT3TeamMyWorkDigestGraph } from "./t3team-myworkDigest.ts";
import {
  digestLastVisitIdentity,
  readDigestLastVisit,
  recordDigestLastVisit,
} from "./t3team-myworkDigestLastVisit.ts";
import { toT3TeamPollResult } from "./t3team-integration-polling.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
  T3TeamMyWorkDigestPollInput,
} from "./t3team-myworkDigestTypes.ts";

/** Wall-clock millis → ISO string, the one Date construction in this route. */
const millisToIso = (ms: number): string => new Date(ms).toISOString();

/** Stamp the previous visit receipt into the payload's viewer (read-only). */
function stampDigestLastVisit(input: T3TeamMyWorkDigestInput, payload: T3TeamMyWorkDigestPayload) {
  return Effect.gen(function* () {
    const identity = digestLastVisitIdentity(input);
    if (identity === undefined) return payload;
    const atMs = yield* readDigestLastVisit(identity, input.scope);
    if (atMs === null) return payload;
    return {
      ...payload,
      viewer: { ...payload.viewer, lastVisitAt: millisToIso(atMs) },
    };
  });
}

const t3teamMyWorkDigestGraphRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/graph",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamMyWorkDigestInput>();
    const payload = yield* loadT3TeamMyWorkDigestGraph(input);
    // Read-only: this route does not record a visit, only reports the receipt.
    return okJson({ payload: yield* stampDigestLastVisit(input, payload) });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamMyWorkDigestGraphPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/mywork-digest/graph/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamMyWorkDigestPollInput>();
    const payload = yield* loadT3TeamMyWorkDigestGraph(input);
    // Fingerprint over the payload WITHOUT the receipt (see the file header).
    const result = toT3TeamPollResult(payload, input.poll);
    if (result.unchanged === true) {
      return okJson(result);
    }
    // A changed round is a visit: stamp the PREVIOUS receipt, then record this one.
    const value = yield* stampDigestLastVisit(input, payload);
    const identity = digestLastVisitIdentity(input);
    if (identity !== undefined) {
      const atMs = yield* Clock.currentTimeMillis;
      yield* recordDigestLastVisit(identity, input.scope, atMs);
    }
    return okJson({ unchanged: false as const, fingerprint: result.fingerprint, value });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamMyWorkDigestRouteLayer = Layer.mergeAll(
  t3teamMyWorkDigestGraphRouteLayer,
  t3teamMyWorkDigestGraphPollRouteLayer,
);
