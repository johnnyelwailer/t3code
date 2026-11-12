import type { DiffExplorerFile } from "./t3team-prDiffExplorer.logic";

/** Pure logic for the diff explorer's folder-level "viewed" checkbox. Nothing here is persisted. */

export type DiffExplorerViewedState = "none" | "partial" | "all";

/** The files under a directory path as the tree names it (`a/b/`, trailing slash). */
export function diffExplorerFilesUnder(
  files: readonly DiffExplorerFile[],
  directoryPath: string,
): readonly DiffExplorerFile[] {
  return files.filter((file) => file.path.startsWith(directoryPath));
}

/** How much of a directory's files are viewed; a directory with no files reads as `none`. */
export function diffExplorerViewedState(
  keys: readonly string[],
  viewed: ReadonlySet<string>,
): DiffExplorerViewedState {
  let marked = 0;
  for (const key of keys) if (viewed.has(key)) marked++;
  if (marked === 0) return "none";
  return marked === keys.length ? "all" : "partial";
}

/**
 * The files a press has to tell the host about. Viewing leaves out what is already fully viewed
 * but takes a ticked file that has changed since, which re-marks it; clearing takes everything
 * still ticked, changed or not.
 */
export function diffExplorerPressChanges<File extends { readonly path: string }>(
  files: readonly File[],
  viewing: boolean,
  state: {
    readonly isViewed: (path: string) => boolean;
    readonly isTicked: (path: string) => boolean;
  },
): readonly File[] {
  return files.filter((file) => (viewing ? !state.isViewed(file.path) : state.isTicked(file.path)));
}

/** The viewed set after toggling a directory: all viewed becomes none, anything else all. */
export function toggleDirectoryViewedKeys(
  viewed: ReadonlySet<string>,
  keys: readonly string[],
): ReadonlySet<string> {
  const next = new Set(viewed);
  const clearing = diffExplorerViewedState(keys, viewed) === "all";
  for (const key of keys) {
    if (clearing) next.delete(key);
    else next.add(key);
  }
  return next;
}
