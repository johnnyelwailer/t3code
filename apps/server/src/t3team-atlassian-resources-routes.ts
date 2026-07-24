import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import { type T3TeamPollEnvelope, toT3TeamPollResult } from "./t3team-integration-polling.ts";
import {
  loadT3TeamAtlassianResourcesPage,
  type T3TeamAtlassianResourcesInput,
} from "./t3team-atlassian-resources.ts";

type T3TeamAtlassianResourcesPollInput = T3TeamAtlassianResourcesInput & {
  readonly poll: T3TeamPollEnvelope;
};

const t3teamAtlassianResourcesReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/resources",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianResourcesInput>();
    const page = yield* loadT3TeamAtlassianResourcesPage(input);
    return okJson({ page });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianResourcesPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/resources/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianResourcesPollInput>();
    const page = yield* loadT3TeamAtlassianResourcesPage(input);
    return okJson(toT3TeamPollResult(page, input.poll));
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianResourcesRouteLayer = Layer.mergeAll(
  t3teamAtlassianResourcesReadRouteLayer,
  t3teamAtlassianResourcesPollRouteLayer,
);
