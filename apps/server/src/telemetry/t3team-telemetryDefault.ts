/**
 * Telemetry is off unless `T3CODE_TELEMETRY_ENABLED` says otherwise, or the flag is unset and a
 * deployment-owned `T3CODE_POSTHOG_HOST` is set; upstream's default posts to T3's ingest.
 */
import * as Config from "effect/Config";
import * as Option from "effect/Option";

export const telemetryEnabledConfig = Config.all({
  explicit: Config.Boolean("T3CODE_TELEMETRY_ENABLED").pipe(Config.option),
  ownHost: Config.String("T3CODE_POSTHOG_HOST").pipe(Config.option),
}).pipe(
  Config.map(({ explicit, ownHost }) =>
    Option.getOrElse(explicit, () => Option.exists(ownHost, (host) => host.trim().length > 0)),
  ),
);
