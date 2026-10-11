/**
 * Human display labels for tool/script step callees.
 *
 * The invariant (owner 2026-10-11): every step entry ALWAYS carries a human display label —
 * a bare generic "Tool"/"Script" is NOT acceptable as a primary title. The label is derived
 * from the LAST segment of the callee path (split on camelCase/PascalCase/snake/kebab
 * boundaries; version suffixes like "V2" stick to their word), joined in sentence case:
 * `github.releases.collectChangelog` → "Collect changelog", `scripts.publishRelease` →
 * "Publish release". The raw callee path NEVER becomes the title; it stays in `detail`,
 * reachable on demand (tooltip / expanded step details).
 *
 * The generic "Tool"/"Script" word is the last-resort fallback, used ONLY when the last
 * segment is empty or has no letters to derive from. An authored `label:` option on the
 * call still wins over every derivation.
 */

/** Split a `collectChangelog` / `publish_release` / `run-2` style identifier into words.
 * Version suffixes stay attached: `parseV2` → ["parse", "V2"]. */
export function splitIdentifierWords(segment: string): string[] {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[_\-\s]+/)
    .filter((word) => word.length > 0);
}

/**
 * The human display label for an unlabeled tool/script step: the humanized last segment of the
 * callee, or `fallback` ("Tool"/"Script") when the segment yields no letters.
 */
export function humanizedCalleeLabel(lastSegment: string, fallback: string): string {
  const words = splitIdentifierWords(lastSegment).filter((word) => /[a-z]/i.test(word));
  if (words.length === 0) return fallback;
  const [first, ...rest] = words;
  const head = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return rest.length === 0 ? head : `${head} ${rest.map((word) => word.toLowerCase()).join(" ")}`;
}
