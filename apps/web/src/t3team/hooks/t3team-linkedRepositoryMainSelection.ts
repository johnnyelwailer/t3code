/**
 * Main-repository selection for the linked-repositories dialog.
 *
 * Rules, including option A when the main repository is unlinked:
 * - The first repository that becomes linked (the list was empty) is the main one.
 * - An existing main stays as long as it is still linked. Clicking "Make main" on another
 *   linked row replaces it.
 * - When the main repository is unlinked and others remain, the first remaining linked
 *   repository (list order) becomes main. When none remain, there is no main: a local
 *   workspace will be created.
 * - Opening a dialog on an existing project that already has linked repositories and no
 *   main does not auto-promote one; the user picks with "Make main", or a local workspace
 *   is used. Auto-detection for a newly created project is a separate path
 *   (`applyMainRepositoryAutoDetection`) and never overrides an explicit user choice.
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
