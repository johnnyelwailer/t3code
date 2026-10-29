/**
 * Whether an environment value looks like a different kind of secret than the one a request names.
 * Only the leading characters are read, and nothing here returns or logs any part of the value.
 */
export type SecretShape = "github" | "npm" | "aws" | "slack" | "openai" | "unknown";

export function shapeOf(value: string): SecretShape {
  if (/^(gh[pousr]_|github_pat_)/.test(value)) return "github";
  if (/^npm_[A-Za-z0-9]{20,}/.test(value)) return "npm";
  if (/^(AKIA|ASIA)[A-Z0-9]{12,}/.test(value)) return "aws";
  if (/^xox[abprs]-/.test(value)) return "slack";
  if (/^sk-[A-Za-z0-9_-]{16,}/.test(value)) return "openai";
  return "unknown";
}

/** What the request itself says it wants: its host first, then its name. `undefined` when it says nothing. */
export function expectedShape(
  host: string | undefined,
  name: string | undefined,
): SecretShape | undefined {
  if (host !== undefined) {
    if (host === "github.com" || host.endsWith(".ghe.com") || host.endsWith(".github.com"))
      return "github";
    if (host.includes("npmjs")) return "npm";
  }
  const upper = name?.toUpperCase() ?? "";
  if (/(^|_)(GH|GITHUB)(_|$)/.test(upper)) return "github";
  if (/^NPM(_|$)/.test(upper)) return "npm";
  return undefined;
}

export function looksLikeAnotherSecret(value: string, expected: SecretShape | undefined): boolean {
  const actual = shapeOf(value);
  return expected !== undefined && actual !== "unknown" && actual !== expected;
}
