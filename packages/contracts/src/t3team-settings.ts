/**
 * t3team fork settings under the `t3team` namespace; `settings.ts` keeps only the one `t3team`
 * field seam per schema. New keys are canonical; legacy flat persisted keys decode in through
 * `migrateLegacyT3Team*SettingsJson` at the settings load points, and new writes stop emitting them.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TrimmedString } from "./baseSchemas.ts";

/** ON by default for this distribution; generation is light by construction and fail-open. */
export const T3TeamActivityLabels = Schema.Boolean.pipe(
  Schema.withDecodingDefault(Effect.succeed(true)),
);
/** ON by default for this distribution; the setting is the way back to the dropdown alone. */
export const T3TeamProjectScopePills = Schema.Boolean.pipe(
  Schema.withDecodingDefault(Effect.succeed(true)),
);
/** ON by default for this distribution; fail-open, so a fetch failure keeps the fallback icon. */
export const T3TeamProjectSourceIconIngest = Schema.Boolean.pipe(
  Schema.withDecodingDefault(Effect.succeed(true)),
);

/** Fork fields on the server settings schema, nested under `t3team`. */
export const T3TeamServerSettings = Schema.Struct({
  /**
   * Short LLM-generated "working on" labels for active threads. Server-authoritative: the label
   * generator (inference side) and the sidebar pills (display side) must agree.
   */
  activityLabels: T3TeamActivityLabels,
  /**
   * Sidebar project scope as a one-click pill row instead of the "All projects" dropdown alone;
   * while on, the scope also narrows other surfaces to the selected project.
   */
  projectScopePills: T3TeamProjectScopePills,
  /**
   * Ingests a bound work source's project avatar at bind/creation time. Server-authoritative
   * like `activityLabels`: the ingest runs at command dispatch, so every client sees the same.
   */
  projectSourceIconIngest: T3TeamProjectSourceIconIngest,
  storedSidebarPinsJson: Schema.optionalKey(TrimmedString),
  storedSidecarCompositionJson: Schema.optionalKey(TrimmedString),
});
export type T3TeamServerSettings = typeof T3TeamServerSettings.Type;

export const T3TeamServerSettingsPatch = Schema.Struct({
  activityLabels: Schema.optionalKey(Schema.Boolean),
  projectScopePills: Schema.optionalKey(Schema.Boolean),
  projectSourceIconIngest: Schema.optionalKey(Schema.Boolean),
  storedSidebarPinsJson: Schema.optionalKey(TrimmedString),
  storedSidecarCompositionJson: Schema.optionalKey(TrimmedString),
});
export type T3TeamServerSettingsPatch = typeof T3TeamServerSettingsPatch.Type;

/** Welcome-page sections the user skipped; kept so quitting mid-setup resumes where they were. */
export const T3TeamWelcomeSkipKey = Schema.Literals(["account", "jira", "github", "cloud"]);
export type T3TeamWelcomeSkipKey = typeof T3TeamWelcomeSkipKey.Type;

/**
 * The welcome-setup generation the user has already completed or skipped. Absent or older than
 * the current generation means the setup should be shown once.
 */
export const T3TeamWelcomeSeenVersion = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type T3TeamWelcomeSeenVersion = typeof T3TeamWelcomeSeenVersion.Type;

/** Fork fields on the client settings schema, nested under `t3team`. */
export const T3TeamClientSettings = Schema.Struct({
  welcomeSkipped: Schema.optionalKey(Schema.Array(T3TeamWelcomeSkipKey)),
  welcomeSeenVersion: Schema.optionalKey(T3TeamWelcomeSeenVersion),
  storedSidebarNavPreferencesJson: Schema.optionalKey(TrimmedString),
  storedProjectsJson: Schema.optionalKey(TrimmedString),
  storedSidebarPinsJson: Schema.optionalKey(TrimmedString),
  storedSidecarCompositionJson: Schema.optionalKey(TrimmedString),
  storedThreadsJson: Schema.optionalKey(TrimmedString),
});
export type T3TeamClientSettings = typeof T3TeamClientSettings.Type;

export const T3TeamClientSettingsPatch = Schema.Struct({
  welcomeSkipped: Schema.optionalKey(Schema.Array(T3TeamWelcomeSkipKey)),
  welcomeSeenVersion: Schema.optionalKey(T3TeamWelcomeSeenVersion),
  storedSidebarNavPreferencesJson: Schema.optionalKey(TrimmedString),
  storedProjectsJson: Schema.optionalKey(TrimmedString),
  storedSidebarPinsJson: Schema.optionalKey(TrimmedString),
  storedSidecarCompositionJson: Schema.optionalKey(TrimmedString),
  storedThreadsJson: Schema.optionalKey(TrimmedString),
});
export type T3TeamClientSettingsPatch = typeof T3TeamClientSettingsPatch.Type;

const LEGACY_SERVER_KEY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["t3teamActivityLabelsEnabled", "activityLabels"],
  ["t3teamProjectScopePillsEnabled", "projectScopePills"],
  ["t3teamProjectSourceIconIngestEnabled", "projectSourceIconIngest"],
  ["t3teamStoredSidebarPinsJson", "storedSidebarPinsJson"],
  ["t3teamStoredSidecarCompositionJson", "storedSidecarCompositionJson"],
];

const LEGACY_CLIENT_KEY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["t3teamStoredSidebarNavPreferencesJson", "storedSidebarNavPreferencesJson"],
  ["t3teamStoredProjectsJson", "storedProjectsJson"],
  ["t3teamStoredSidebarPinsJson", "storedSidebarPinsJson"],
  ["t3teamStoredSidecarCompositionJson", "storedSidecarCompositionJson"],
  ["t3teamStoredThreadsJson", "storedThreadsJson"],
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateLegacyKeys(
  raw: unknown,
  aliases: ReadonlyArray<readonly [string, string]>,
): unknown {
  if (!isPlainRecord(raw)) return raw;
  const legacyKeys = aliases.filter(([legacy]) => Object.hasOwn(raw, legacy));
  if (legacyKeys.length === 0) return raw;
  const existing = isPlainRecord(raw.t3team) ? raw.t3team : undefined;
  const namespace: Record<string, unknown> = { ...existing };
  let changed = false;
  for (const [legacy, next] of legacyKeys) {
    if (!Object.hasOwn(namespace, next)) {
      namespace[next] = raw[legacy];
      changed = true;
    }
  }
  if (!changed) return raw;
  return { ...raw, t3team: namespace };
}

/**
 * Copies pre-namespace server values (e.g. `t3teamActivityLabelsEnabled`) into `t3team.*`
 * before `ServerSettings` decodes a persisted document. Idempotent; returns the input
 * untouched when no legacy key is present.
 */
export const migrateLegacyT3TeamServerSettingsJson = (raw: unknown): unknown =>
  migrateLegacyKeys(raw, LEGACY_SERVER_KEY_ALIASES);

/** Same as `migrateLegacyT3TeamServerSettingsJson`, for persisted client settings. */
export const migrateLegacyT3TeamClientSettingsJson = (raw: unknown): unknown =>
  migrateLegacyKeys(raw, LEGACY_CLIENT_KEY_ALIASES);
