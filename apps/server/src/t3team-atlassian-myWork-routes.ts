import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody } from "./t3team-atlassian-http.ts";
import {
  loadT3TeamAtlassianMyWork,
  type T3TeamAtlassianMyWorkInput,
  type T3TeamAtlassianMyWorkPollInput,
} from "./t3team-atlassian-myWork.ts";

const t3teamAtlassianMyWorkReadRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/my-work",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianMyWorkInput>();
    const page = yield* loadT3TeamAtlassianMyWork(input);
    return okJson({ page });
  }).pipe(Effect.catch(errorResponse)),
);

const t3teamAtlassianMyWorkPollRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/atlassian/my-work/poll",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamAtlassianMyWorkPollInput>();
    const result = yield* loadT3TeamAtlassianMyWork(input);
    return okJson(result);
  }).pipe(Effect.catch(errorResponse)),
);

export const t3teamAtlassianMyWorkRouteLayer = Layer.mergeAll(
  t3teamAtlassianMyWorkReadRouteLayer,
  t3teamAtlassianMyWorkPollRouteLayer,
);
