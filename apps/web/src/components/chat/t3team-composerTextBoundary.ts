/**
 * Where text appended at the end of the draft joins what is already there. Exactly one
 * separating space — unless the existing text already ends with whitespace, or the incoming
 * text starts with whitespace or punctuation.
 */
export function needsComposerBoundarySpace(
  existing: string,
  cursor: number,
  incoming: string,
): boolean {
  if (cursor <= 0 || incoming === "") return false;
  const before = existing[cursor - 1] ?? "";
  if (/\s/.test(before)) return false;
  const first = incoming[0] ?? "";
  if (/\s/.test(first)) return false;
  return /^[\p{L}\p{N}]/u.test(first);
}

/**
 * The leading-space decision for `insertComposerText`. Dictation text takes the punctuation-
 * aware boundary rule; every other caller (file links, mentions, citations) keeps the plain
 * "space unless the draft already ends in whitespace" rule, so links like `[index.ts](…)`
 * always get the whitespace the file-link parser needs.
 */
export function needsComposerLeadingSpace(
  options: { ensureLeadingBoundary?: boolean; voiceBoundary?: boolean } | undefined,
  existing: string,
  cursor: number,
  incoming: string,
): boolean {
  if (options?.voiceBoundary === true) {
    return needsComposerBoundarySpace(existing, cursor, incoming);
  }
  return (
    (options?.ensureLeadingBoundary ?? false) &&
    cursor > 0 &&
    !/\s/.test(existing[cursor - 1] ?? "")
  );
}
