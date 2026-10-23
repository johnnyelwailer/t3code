/**
 * HTTP routes behind a host feature flag. While the flag is off a gated route answers
 * `403 { error, code: "feature_disabled" }` without running its handler; the flag is read on
 * every request, so a change in Settings → Features applies to the next call.
 */
import {
  findFeatureFlag,
  readFeatureFlag,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { HttpServerResponse } from "effect/http";

export const FEATURE_DISABLED_CODE = "feature_disabled";

export function featureDisabledMessage(key: FeatureFlagKey): string {
  return `${findFeatureFlag(key)?.label ?? key} is turned off on this host (Settings → Features).`;
}

export const whenRouteFeatureEnabled = <E, R>(
  key: FeatureFlagKey,
  handler: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, R> =>
  Effect.suspend(() =>
    readFeatureFlag(key)
      ? handler
      : Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: featureDisabledMessage(key), code: FEATURE_DISABLED_CODE },
            { status: 403 },
          ),
        ),
  );
