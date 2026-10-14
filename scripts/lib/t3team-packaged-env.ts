import * as Data from "effect/Data";

/**
 * Fills the Atlassian OAuth keys into the desktop app's packaged `Resources/.env`.
 *
 * The packaged `.env` used to be a verbatim copy of whichever repo `.env` the build found. When
 * that file lacked the client secret (CI builds pass it as a build env var/secret instead), the
 * app only had a secret when it happened to be launched from a shell that exported one. Without
 * it every token refresh was refused and Jira asked for a new sign-in after each restart.
 *
 * This only fills keys the file does not already define (the file wins), never logs values, and
 * refuses a distribution build that ships a client id without its secret.
 */
const ALIASES = {
  T3TEAM_ATLASSIAN_CLIENT_ID: [
    "T3TEAM_ATLASSIAN_CLIENT_ID",
    "T3WORK_ATLASSIAN_CLIENT_ID",
    "VITE_ATLASSIAN_CLIENT_ID",
    "ATLASSIAN_CLIENT_ID",
  ],
  T3TEAM_ATLASSIAN_CLIENT_SECRET: [
    "T3TEAM_ATLASSIAN_CLIENT_SECRET",
    "T3WORK_ATLASSIAN_CLIENT_SECRET",
    "ATLASSIAN_CLIENT_SECRET",
  ],
} as const;

type CanonicalKey = keyof typeof ALIASES;

function parseEnvText(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(
      line
        .slice(0, eq)
        .trim()
        .replace(/^export\s+/, ""),
      value,
    );
  }
  return values;
}

function firstValue(
  source: ReadonlyMap<string, string> | Readonly<Record<string, string | undefined>>,
  keys: ReadonlyArray<string>,
) {
  for (const key of keys) {
    const value = (source instanceof Map ? source.get(key) : (source as never)[key]) as
      | string
      | undefined;
    if (value?.trim()) return value.trim();
  }
  return "";
}

export class T3TeamPackagedEnvError extends Data.TaggedError("T3TeamPackagedEnvError")<{
  readonly message: string;
}> {}

export type PackagedEnvResult = {
  /** The new `.env` text (unchanged when nothing was missing). */
  readonly text: string;
  /** Canonical key names that were filled from the build environment (names only, no values). */
  readonly filledKeys: ReadonlyArray<CanonicalKey>;
};

export function t3teamFillPackagedAtlassianEnv(
  envText: string,
  buildEnv: Readonly<Record<string, string | undefined>>,
): PackagedEnvResult {
  const fileValues = parseEnvText(envText);
  const filledKeys: CanonicalKey[] = [];
  const additions: string[] = [];
  for (const canonical of Object.keys(ALIASES) as CanonicalKey[]) {
    if (firstValue(fileValues, ALIASES[canonical])) continue;
    const value = firstValue(buildEnv, ALIASES[canonical]);
    if (!value) continue;
    if (/[\r\n]/.test(value)) {
      throw new T3TeamPackagedEnvError({
        message: `${canonical} from the build environment spans lines.`,
      });
    }
    additions.push(`${canonical}=${value}`);
    filledKeys.push(canonical);
  }
  const text =
    additions.length === 0
      ? envText
      : `${envText}${envText === "" || envText.endsWith("\n") ? "" : "\n"}${additions.join("\n")}\n`;

  const finalValues = parseEnvText(text);
  const hasClientId = firstValue(finalValues, ALIASES.T3TEAM_ATLASSIAN_CLIENT_ID) !== "";
  const hasSecret = firstValue(finalValues, ALIASES.T3TEAM_ATLASSIAN_CLIENT_SECRET) !== "";
  if (hasClientId && !hasSecret) {
    throw new T3TeamPackagedEnvError({
      message:
        "The packaged desktop .env has an Atlassian client id but no client secret. Set " +
        "T3TEAM_ATLASSIAN_CLIENT_SECRET (or T3WORK_ATLASSIAN_CLIENT_SECRET) in the build " +
        "environment or the repo .env; without it Jira sign-in is lost on every restart.",
    });
  }
  return { text, filledKeys };
}
