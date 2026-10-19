/** `POST /api/t3team/voice/route {text}` → `{tier}`: the per-utterance control-vs-synthesis call. */
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/http";

import {
  badRequestJson,
  errorResponse,
  okJson,
  readJsonBody,
  toAtlassianError,
} from "./t3team-atlassian-http.ts";
import { classifyVoiceUtterance } from "./t3team-voiceRouting.ts";

const MAX_UTTERANCE_CHARS = 2_000;

export const t3teamVoiceRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/voice/route",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly text?: unknown }>();
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (text.length === 0) return badRequestJson("An utterance is required.");
    const tier = yield* Effect.promise(() =>
      classifyVoiceUtterance(text.slice(0, MAX_UTTERANCE_CHARS)),
    );
    return okJson({ tier });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to route the voice utterance.")),
    Effect.catch(errorResponse),
  ),
);
