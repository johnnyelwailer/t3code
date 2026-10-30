/**
 * Whether usage telemetry is on when `T3CODE_TELEMETRY_ENABLED` is not set.
 *
 * Upstream defaults to on and posts to T3's own PostHog ingest. The Nexplore distribution must
 * not send usage events to a third party by default, so the default is off unless this
 * deployment names its own ingest: an explicit `T3CODE_POSTHOG_HOST` (with `T3CODE_POSTHOG_KEY`)
 * turns it on. An explicit `T3CODE_TELEMETRY_ENABLED` value, true or false, always wins.
 * The server owns the only analytics sender, so this one default covers the desktop app, cloud
 * sessions and the headless CLI.
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
