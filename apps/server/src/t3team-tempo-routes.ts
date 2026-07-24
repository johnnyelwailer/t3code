import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import {
  loadT3TeamTempoCapacity,
  loadTempoToken,
  saveTempoToken,
  type T3TeamTempoCapacityInput,
} from "./t3team-tempo.ts";

const t3teamTempoCapacityRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/tempo/capacity",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamTempoCapacityInput>();
    const result = yield* loadT3TeamTempoCapacity(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamTempoTokenRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/tempo/token",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly token?: string | null }>();
    yield* saveTempoToken(input.token ?? null);
    const token = yield* loadTempoToken;
    return okJson({ configured: token !== null });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamTempoStatusRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/tempo/status",
  Effect.gen(function* () {
    const token = yield* loadTempoToken;
    return okJson({ configured: token !== null });
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamTempoRouteLayer = Layer.mergeAll(
  t3teamTempoCapacityRouteLayer,
  t3teamTempoTokenRouteLayer,
  t3teamTempoStatusRouteLayer,
);
