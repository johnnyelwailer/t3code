/**
 * Telemetry is off unless `T3CODE_TELEMETRY_ENABLED` says otherwise, or the flag is unset and
 * both `T3CODE_POSTHOG_HOST` and `T3CODE_POSTHOG_KEY` are set: upstream's default host and key
 * post to T3's ingest, so a lone host or key never switches it on.
 */
import * as Config from "effect/Config";
import * as Option from "effect/Option";

const configured = (value: Option.Option<string>) =>
  Option.exists(value, (text) => text.trim().length > 0);

export const telemetryEnabledConfig = Config.all({
  explicit: Config.Boolean("T3CODE_TELEMETRY_ENABLED").pipe(Config.option),
  ownHost: Config.String("T3CODE_POSTHOG_HOST").pipe(Config.option),
  ownKey: Config.String("T3CODE_POSTHOG_KEY").pipe(Config.option),
}).pipe(
  Config.map(({ explicit, ownHost, ownKey }) =>
    Option.getOrElse(explicit, () => configured(ownHost) && configured(ownKey)),
  ),
);
