/**
 * First new link becomes main; unlinking main promotes the next remaining
 * repo (or none). An existing project with no main is not auto-promoted.
 */

export function resolveMainRepositoryUrl(input: {
  readonly linkedUrls: ReadonlyArray<string>;
  readonly currentMain: string | null;
  readonly previousLinkedUrls: ReadonlyArray<string>;
}): string | null {
  const { linkedUrls, currentMain, previousLinkedUrls } = input;
  if (currentMain !== null && linkedUrls.includes(currentMain)) return currentMain;
  if (linkedUrls.length === 0) return null;
  const unlinkedMain = currentMain !== null && !linkedUrls.includes(currentMain);
  if (unlinkedMain) return linkedUrls[0] ?? null;
  // No main: only the first link (empty → one or more) promotes automatically.
  if (previousLinkedUrls.length === 0) return linkedUrls[0] ?? null;
  return null;
}
