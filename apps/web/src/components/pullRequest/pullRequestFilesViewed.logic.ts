import type { PullRequestFileViewedState, PullRequestFilesViewedResult } from "@t3tools/contracts";

export type FileViewedStates = ReadonlyMap<string, PullRequestFileViewedState>;

export type FileViewedOverlay = ReadonlyMap<string, boolean>;

export function toFileViewedStates(
  result: PullRequestFilesViewedResult | null,
): FileViewedStates | null {
  if (result === null) return null;
  return new Map(result.files.map((file) => [file.path, file.state]));
}

function isViewedState(state: PullRequestFileViewedState | undefined): boolean {
  return state === "viewed";
}

export function isStaleViewedState(state: PullRequestFileViewedState | undefined): boolean {
  return state === "dismissed";
}

/**
 * What a checkbox shows. A file pushed to since it was cleared keeps its tick, with the change
 * flagged beside it, so the reader sees what they once cleared and what has moved since. Counts
 * stay on `isFileViewed`: only a file whose current code was seen is done.
 */
export function isFileTicked(
  path: string,
  states: FileViewedStates | null,
  overlay: FileViewedOverlay,
): boolean {
  const pressed = overlay.get(path);
  if (pressed !== undefined) return pressed;
  const state = states?.get(path);
  return isViewedState(state) || isStaleViewedState(state);
}

export function isFileViewed(
  path: string,
  states: FileViewedStates | null,
  overlay: FileViewedOverlay,
): boolean {
  const pressed = overlay.get(path);
  return pressed ?? isViewedState(states?.get(path));
}

/**
 * A press is held until a read that could have seen it comes back, rather than cleared when the
 * write succeeds: that read is a separate round trip, and dropping the press in between flashes
 * the checkbox back.
 */
export function settleFileViewedOverlay(
  overlay: FileViewedOverlay,
  states: FileViewedStates | null,
  pending: ReadonlySet<string>,
  answered: ReadonlySet<string>,
): FileViewedOverlay {
  if (states === null || overlay.size === 0) return overlay;
  const next = new Map(overlay);
  for (const [path, pressed] of overlay) {
    if (pending.has(path)) continue;
    if (answered.has(path) || isViewedState(states.get(path)) === pressed) next.delete(path);
  }
  return next.size === overlay.size ? overlay : next;
}

/**
 * `owned` are the paths that request still answers for, which keeps a failure from reaching past
 * its own presses: a path pressed again since belongs to a later request or to the next flush,
 * and putting that box back to the host's answer would take a press out from under the reader's
 * hand.
 */
export function revertFileViewedOverlay(
  overlay: FileViewedOverlay,
  batch: ReadonlyArray<{ readonly path: string; readonly viewed: boolean }>,
  owned: ReadonlySet<string>,
): FileViewedOverlay {
  const next = new Map(overlay);
  for (const { path, viewed } of batch) {
    if (!owned.has(path)) continue;
    if (next.get(path) === viewed) next.delete(path);
  }
  return next.size === overlay.size ? overlay : next;
}

export function toFileViewedBatch(
  overlay: FileViewedOverlay,
): ReadonlyArray<{ readonly path: string; readonly viewed: boolean }> {
  return [...overlay].map(([path, viewed]) => ({ path, viewed }));
}
