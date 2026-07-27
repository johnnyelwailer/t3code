/**
 * Resolves the Atlassian OAuth client credentials from the environment.
 *
 * These variables were named `T3WORK_*` before the t3work -> t3team rename, and a `.env` lives
 * outside the repository, so renaming the code silently un-configured OAuth for everyone holding a
 * pre-rename file: the app fell back to the API-token form with no explanation. The legacy names are
 * accepted as a fallback so an existing `.env` keeps working, and `VITE_`/bare forms stay supported
 * for deployments that set them that way.
 *
 * Preference order puts the current name first, so a file defining both wins on the new one.
 */
const CLIENT_ID_KEYS = [
  "T3TEAM_ATLASSIAN_CLIENT_ID",
  "T3WORK_ATLASSIAN_CLIENT_ID",
  "VITE_ATLASSIAN_CLIENT_ID",
  "ATLASSIAN_CLIENT_ID",
] as const;

const CLIENT_SECRET_KEYS = [
  "T3TEAM_ATLASSIAN_CLIENT_SECRET",
  "T3WORK_ATLASSIAN_CLIENT_SECRET",
  "ATLASSIAN_CLIENT_SECRET",
] as const;

function readFirst(keys: ReadonlyArray<string>): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

export function readAtlassianOAuthClientId(): string {
  return readFirst(CLIENT_ID_KEYS);
}

export function readAtlassianOAuthClientSecret(): string {
  return readFirst(CLIENT_SECRET_KEYS);
}

/** The names a user is most likely to have set, for error messages that can actually be acted on. */
export const ATLASSIAN_OAUTH_ENV_HINT = `${CLIENT_ID_KEYS[0]} and ${CLIENT_SECRET_KEYS[0]}`;
