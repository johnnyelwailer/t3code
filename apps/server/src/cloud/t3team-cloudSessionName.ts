import { sessionTagFromInt } from "@t3tools/shared/t3team-cloudSessionName";
import * as Effect from "effect/Effect";
import * as Random from "effect/Random";

/**
 * A correlation tag for one dispatch, drawn from the server's `Random` service. The name rules and
 * the tag's shape are shared with the phone (`@t3tools/shared/t3team-cloudSessionName`), which is
 * also where `sessionNameFromRunName` lives. Random rather than time-based: two clients
 * dispatching in the same millisecond must not collide, which is the whole failure this exists to
 * prevent.
 */
export const makeSessionTag = (name: string | null) =>
  Effect.map(Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER), (value) =>
    sessionTagFromInt(name, value),
  );
