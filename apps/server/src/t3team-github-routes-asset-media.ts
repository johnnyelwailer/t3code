import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as BuiltInDrivers from "./sourceControl/builtInDrivers.ts";
import { sourceControlDefinitions } from "./sourceControl/sourceControlDefinitions.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

/**
 * Media the user's PR detail loads through the source-control media proxy, fetched the same way
 * for the agent, so it reads the bytes the user sees. `None` when the URL is not such media or no
 * driver fetches it; the caller then fetches it itself.
 */
export const fetchProxiedMedia = Effect.fn("T3TeamGitHubAsset.fetchProxiedMedia")(function* (
  url: string,
) {
  const media = sourceControlDefinitions.mediaUrl(url);
  const drivers = yield* BuiltInDrivers.SourceControlDrivers;
  const fetchMedia =
    media === null
      ? undefined
      : drivers.find(({ driver }) => driver.kind === media.definition.kind)?.instance.fetchMedia;
  if (media === null || fetchMedia === undefined) return Option.none();
  const response = yield* fetchMedia({ url: media.fetchUrl, headers: {} }).pipe(
    Effect.mapError(
      (cause) =>
        new T3TeamAtlassianError({ message: `GitHub media request failed: ${cause.message}` }),
    ),
  );
  if (response === null) {
    return yield* new T3TeamAtlassianError({ message: "GitHub media host refused the request." });
  }
  return Option.some(response);
});
