import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { loadRepoEnv } from "./public-config.ts";

export const REQUIRED_BUILD_ENV_KEYS: ReadonlyArray<string> = [
  "T3TEAM_ATLASSIAN_CLIENT_ID",
  "T3TEAM_ATLASSIAN_CLIENT_SECRET",
];

export const BUILD_ENV_SOURCES: ReadonlyArray<string> = [
  "process environment",
  ".env",
  ".env.local",
];

export class MissingRequiredBuildEnvError extends Schema.TaggedError<MissingRequiredBuildEnvError>()(
  "MissingRequiredBuildEnvError",
  {
    missing: Schema.Array(Schema.String),
    searchedSources: Schema.Array(Schema.String),
  },
) {}

const PLACEHOLDER_PREFIX = "your-";

export function isUsableBuildEnvValue(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed !== "" && !trimmed.startsWith(PLACEHOLDER_PREFIX);
}

export function findMissingBuildEnvKeys(
  env: Readonly<Record<string, string | undefined>>,
  requiredKeys: ReadonlyArray<string> = REQUIRED_BUILD_ENV_KEYS,
): ReadonlyArray<string> {
  return requiredKeys.filter((key) => !isUsableBuildEnvValue(env[key]));
}

export const assertRequiredBuildEnv = Effect.fn("assertRequiredBuildEnv")(function* (
  repoRoot: string,
) {
  const missing = findMissingBuildEnvKeys(loadRepoEnv({ repoRoot }));
  if (missing.length > 0) {
    return yield* new MissingRequiredBuildEnvError({
      missing: [...missing],
      searchedSources: [...BUILD_ENV_SOURCES],
    });
  }
});
