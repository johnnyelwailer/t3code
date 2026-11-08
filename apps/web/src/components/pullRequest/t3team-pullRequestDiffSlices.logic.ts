import type { PullRequestOmittedFileStat } from "@t3tools/contracts";

/** One answer from the host: a whole number of files, and where the next one carries on. */
export interface DiffSlice {
  /** What was asked for, null being the first slice. Identifies the slice among the loaded ones. */
  readonly cursor: string | null;
  readonly patch: string;
  readonly truncated: boolean;
  readonly nextCursor: string | null;
  readonly omittedFileStats: ReadonlyArray<PullRequestOmittedFileStat>;
}

/**
 * Whether two answers for the same cursor carry the same content. A refresh that returns the same
 * diff must not replace the slices the reader is looking at — only a page that genuinely changed
 * (the host re-sliced the diff after a push) earns a replacement, and with it the reader's position
 * restarts from the top.
 */
export function isSameDiffSlice(existing: DiffSlice, next: DiffSlice): boolean {
  return (
    existing.patch === next.patch &&
    existing.truncated === next.truncated &&
    existing.nextCursor === next.nextCursor &&
    existing.omittedFileStats.length === next.omittedFileStats.length &&
    existing.omittedFileStats.every((file, index) => {
      const refreshed = next.omittedFileStats[index];
      return (
        refreshed !== undefined &&
        refreshed.path === file.path &&
        refreshed.additions === file.additions &&
        refreshed.deletions === file.deletions
      );
    })
  );
}

/**
 * Folds one answered page into the loaded slices. It returns the input array unchanged — the same
 * reference — when the page matches the slice it landed on, so the caller can tell a no-op refresh
 * from a diff that moved: only a new reference means the slices (and the cursors after them) were
 * replaced and must be re-read from the top.
 */
export function applyDiffSlicePage<S extends DiffSlice>(
  slices: ReadonlyArray<S>,
  cursor: string | null,
  next: S,
): ReadonlyArray<S> {
  const index = slices.findIndex((slice) => slice.cursor === cursor);
  if (index === -1) return [...slices, next];
  const existing = slices[index];
  if (existing !== undefined && isSameDiffSlice(existing, next)) return slices;
  // A page that came back different means the diff moved under the review. The slices after it go
  // with the replacement: their cursors were positions in the old diff.
  return [...slices.slice(0, index), next];
}
