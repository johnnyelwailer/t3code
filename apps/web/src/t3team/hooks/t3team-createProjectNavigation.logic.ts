/**
 * History arithmetic for the create-project dialog, kept pure so it can be tested without a router.
 *
 * Indexes are TanStack's `__TSR_index` (position of an entry in this tab's history). The dialog is
 * entered at `entryIndex`; the entry just before it (`entryIndex - 1`) is wherever the user was
 * when they asked to add a project. That is where closing should land — NOT `/t3team` — so Back
 * never reopens a dialog the user already dismissed.
 */

/**
 * An index only means something when it is a real position. A history entry can lack one (the
 * pairing page rewrites its entry's state), and arithmetic on that gives NaN — which must read as
 * "unknown", never as a distance to travel.
 */
export function readHistoryIndex(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Entry to return to when the flow opened, or null when it was opened cold (deep link, reload). */
export function resolveCreateOriginIndex(entryIndex: number | null): number | null {
  return entryIndex !== null && entryIndex > 0 ? entryIndex - 1 : null;
}

/** `history.go` delta that closes the flow, or null when there is nowhere in-app to go back to. */
export function resolveCloseDelta(input: {
  readonly originIndex: number | null;
  readonly currentIndex: number | null;
}): number | null {
  if (input.originIndex === null || input.currentIndex === null) return null;
  const delta = input.originIndex - input.currentIndex;
  return delta < 0 ? delta : null;
}

/**
 * Going from "set up" back to "choose": a real history step (negative delta) when the choose screen
 * is still behind us — the normal path, it was pushed — or null when the set-up screen was a deep
 * link and "choose" has to be put in its place with `replace`.
 */
export function resolveBackToChooseDelta(input: {
  readonly chooseIndex: number | null;
  readonly currentIndex: number | null;
}): number | null {
  if (input.chooseIndex === null || input.currentIndex === null) return null;
  const delta = input.chooseIndex - input.currentIndex;
  return delta < 0 ? delta : null;
}
