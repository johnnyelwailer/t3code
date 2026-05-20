import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import { type T3workPollEnvelope, toT3workPollResult } from "./t3work-integration-polling.ts";
import {
  loadT3workAtlassianResourcesPage,
  type T3workAtlassianResourcesInput,
} from "./t3work-atlassian-resources.ts";

type T3workAtlassianResourcesPollInput = T3workAtlassianResourcesInput & {
  readonly poll: T3workPollEnvelope;
};

const t3workAtlassianResourcesReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/resources",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianResourcesInput>();
    const page = yield* loadT3workAtlassianResourcesPage(input);
    return okJson({ page });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianResourcesPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/resources/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianResourcesPollInput>();
    const page = yield* loadT3workAtlassianResourcesPage(input);
    return okJson(toT3workPollResult(page, input.poll));
  }).pipe(Effect.catch(errorResponse)),
);

export const t3workAtlassianResourcesRouteLayer = Layer.mergeAll(
  t3workAtlassianResourcesReadRouteLayer,
  t3workAtlassianResourcesPollRouteLayer,
);
