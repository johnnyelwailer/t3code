import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import {
  loadT3workAtlassianMyWork,
  type T3workAtlassianMyWorkInput,
  type T3workAtlassianMyWorkPollInput,
} from "./t3work-atlassian-myWork.ts";

const t3workAtlassianMyWorkReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/my-work",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianMyWorkInput>();
    const page = yield* loadT3workAtlassianMyWork(input);
    return okJson({ page });
  }).pipe(Effect.catch(errorResponse)),
);

const t3workAtlassianMyWorkPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/my-work/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workAtlassianMyWorkPollInput>();
    const result = yield* loadT3workAtlassianMyWork(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

export const t3workAtlassianMyWorkRouteLayer = Layer.mergeAll(
  t3workAtlassianMyWorkReadRouteLayer,
  t3workAtlassianMyWorkPollRouteLayer,
);
