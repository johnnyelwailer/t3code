const MAX_NOTES = 5;

const CONVENTIONAL_PREFIX =
  /^(feat|fix|perf|revert|chore|ci|docs|refactor|test|tests|build|style)(?:\(([^)]*)\))?!?:\s*/iu;
const MAINTENANCE_TYPES = new Set([
  "chore",
  "ci",
  "docs",
  "refactor",
  "test",
  "tests",
  "build",
  "style",
]);
const TOOLING_SCOPES = new Set(["publish"]);
const MAINTENANCE_LEAD = /^(pin|bump)\b/iu;
const CHANGELOG_LINE = /full changelog|\/compare\//iu;

const AUTHOR_AND_LINK = /\s+by\s+@[\w.-]+(?:\s+in\s+https?:\/\/\S+)?/gu;
const LINK_MARKDOWN = /\[([^\]]+)\]\([^)]*\)/gu;
const BARE_URL = /https?:\/\/\S+/gu;
const PR_REFERENCE = /\s*\(#\d+(?:,\s*#\d+)*\)|\s#\d+\b/gu;

function isMaintenancePrefix(type: string, scope: string): boolean {
  return (
    MAINTENANCE_TYPES.has(type.toLowerCase()) ||
    scope
      .toLowerCase()
      .split(",")
      .some((part) => TOOLING_SCOPES.has(part.trim()))
  );
}

function plainLine(raw: string): string | null {
  const line = raw.trim().replace(/^[-*]\s+/u, "");
  if (CHANGELOG_LINE.test(line)) return null;
  const withoutNoise = line
    .replace(LINK_MARKDOWN, "$1")
    .replace(/\*\*|`/gu, "")
    .replace(AUTHOR_AND_LINK, "")
    .replace(BARE_URL, "")
    .replace(PR_REFERENCE, "");
  const prefix = CONVENTIONAL_PREFIX.exec(withoutNoise);
  if (prefix !== null && isMaintenancePrefix(prefix[1] ?? "", prefix[2] ?? "")) return null;
  const human = withoutNoise.replace(CONVENTIONAL_PREFIX, "").replace(/\s+/gu, " ").trim();
  if (human === "" || MAINTENANCE_LEAD.test(human)) return null;
  return human.charAt(0).toUpperCase() + human.slice(1);
}

/**
 * Release notes for a person: the PR titles of a generated "What's changed" list reduced to their
 * human part, without author, link, PR number or conventional-commit prefix. Maintenance lines
 * (chore, pin, ci, docs, ..., or the publish scope) are dropped, repeats collapse, and at most five remain.
 */
export function plainReleaseNotes(items: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const item of items) {
    const note = plainLine(item);
    if (note === null || seen.has(note.toLowerCase())) continue;
    seen.add(note.toLowerCase());
    notes.push(note);
    if (notes.length === MAX_NOTES) break;
  }
  return notes;
}
