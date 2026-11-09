import type { FileDiffMetadata } from "@pierre/diffs";

import {
  buildFileDiffRenderKey,
  resolveFileDiffPath,
  resolveFileDiffPreviousPath,
} from "~/lib/diffRendering";

/** Pure logic for the PR diff explorer: one file at a time, with a viewed-checkbox file tree. */

export interface DiffExplorerFile {
  readonly key: string;
  readonly path: string;
  readonly oldPath: string | null;
  readonly additions: number;
  readonly deletions: number;
}

/** A parsed diff file's stable key, both paths, and summed add/remove counts. */
export function diffExplorerFileInfo(file: FileDiffMetadata): DiffExplorerFile {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  const path = resolveFileDiffPath(file);
  const oldPath = resolveFileDiffPreviousPath(file);
  return {
    key: buildFileDiffRenderKey(file),
    path,
    oldPath: oldPath === path ? null : oldPath,
    additions,
    deletions,
  };
}

export function toggleViewedFile(
  viewed: ReadonlySet<string>,
  fileKey: string,
): ReadonlySet<string> {
  const next = new Set(viewed);
  if (next.has(fileKey)) next.delete(fileKey);
  else next.add(fileKey);
  return next;
}

export function markAllFilesViewed(files: readonly DiffExplorerFile[]): ReadonlySet<string> {
  return new Set(files.map((file) => file.key));
}

/** `changed` files keep their tick but were pushed to since, so they are not yet fully viewed. */
export function countViewedFiles(
  files: readonly DiffExplorerFile[],
  viewed: ReadonlySet<string>,
  changed: ReadonlySet<string> = new Set(),
): { readonly viewed: number; readonly total: number } {
  let counted = 0;
  for (const file of files) if (viewed.has(file.key) && !changed.has(file.key)) counted++;
  return { viewed: counted, total: files.length };
}

/** The file before `currentKey`, or the last file when nothing is before it (wraps for prev). */
export function previousDiffExplorerFile(
  files: readonly DiffExplorerFile[],
  currentKey: string,
): DiffExplorerFile | null {
  if (files.length === 0) return null;
  const index = files.findIndex((file) => file.key === currentKey);
  if (index <= 0) return files[files.length - 1] ?? null;
  return files[index - 1] ?? null;
}

/** The file after `currentKey`, or the first file when nothing is after it (wraps for next). */
export function nextDiffExplorerFile(
  files: readonly DiffExplorerFile[],
  currentKey: string,
): DiffExplorerFile | null {
  if (files.length === 0) return null;
  const index = files.findIndex((file) => file.key === currentKey);
  if (index < 0 || index === files.length - 1) return files[0] ?? null;
  return files[index + 1] ?? null;
}
