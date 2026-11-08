import * as Schema from "effect/Schema";

import { PortSchema, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

// A supervisor must not restart a server refused by the state-directory owner.
export const SERVER_EXIT_CODE_STATE_DIR_OWNED = 78;

export const DesktopBackendBootstrap = Schema.Struct({
  mode: Schema.Literal("desktop"),
  noBrowser: Schema.Boolean,
  port: PortSchema,
  // Omit in WSL to use the Linux home instead of the mapped Windows directory.
  t3Home: Schema.optional(Schema.String),
  host: Schema.String,
  desktopBootstrapToken: Schema.String,
  // Derives rotating tokens instead of trusting desktopBootstrapToken indefinitely; see @t3tools/shared/desktopBootstrapToken.
  desktopBootstrapSecret: Schema.optionalKey(Schema.String),
  // Absent means the backend must hydrate PATH, as WSL and older desktops require.
  shellEnvironmentPrepared: Schema.optionalKey(Schema.Boolean),
  tailscaleServeEnabled: Schema.Boolean,
  tailscaleServePort: PortSchema,
  otlpTracesUrl: Schema.optional(Schema.String),
  otlpMetricsUrl: Schema.optional(Schema.String),
  otlpLogsUrl: Schema.optional(Schema.String),
  desktopTelemetryFd: Schema.optionalKey(PositiveInt),
  desktopTelemetryControlFd: Schema.optionalKey(PositiveInt),
  desktopBrowserFd: Schema.optionalKey(PositiveInt),
  desktopBrowserControlFd: Schema.optionalKey(PositiveInt),
  /** Server -> desktop: `DesktopBackendLivenessBeacon` lines from a thread beside the event loop. */
  desktopLivenessFd: Schema.optionalKey(PositiveInt),
  resourceMonitorPath: Schema.optionalKey(TrimmedNonEmptyString),
});

export type DesktopBackendBootstrap = typeof DesktopBackendBootstrap.Type;

/**
 * Written about once a second by a backend worker thread, so it keeps arriving while the
 * backend's event loop is blocked. `stalledForMs` is how long the event loop has not turned;
 * `maxStallMs` is the longest such stall over the recent window.
 */
export const DesktopBackendLivenessBeacon = Schema.Struct({
  version: Schema.Literal(1),
  stalledForMs: Schema.Number,
  maxStallMs: Schema.Number,
});

export type DesktopBackendLivenessBeacon = typeof DesktopBackendLivenessBeacon.Type;

/** Written to `<t3Home>/runtime` before update shutdown so the backend retains its managed tunnel. */
export const DESKTOP_UPDATE_RESTART_MARKER_FILE = "desktop-update-restart";
