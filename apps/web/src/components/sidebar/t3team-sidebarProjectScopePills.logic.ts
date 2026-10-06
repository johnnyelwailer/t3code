/** Disc geometry shared by the layout math and the renderer (px). */
export const SCOPE_DISC_SIZE = 28;
export const SCOPE_DISC_OVERLAP = 8;
/**
 * Extra width the selected disc takes when unfolded: the `max-w-28` label (112px) plus its
 * gap and the wider padding, beyond the disc's own 28px. Reserved up front so the trailing
 * discs never get clipped when a long name opens.
 */
const SCOPE_CHIP_LABEL_WIDTH = 124;

/** How many project discs fit beside the always-present "All" disc in `width` px. */
export function projectScopeDiscCapacity(width: number): number {
  const remaining = width - SCOPE_DISC_SIZE - SCOPE_CHIP_LABEL_WIDTH;
  return remaining <= 0 ? 0 : Math.floor(remaining / (SCOPE_DISC_SIZE - SCOPE_DISC_OVERLAP));
}

/**
 * Which project groups get a disc. The input is the sidebar's project list in its current
 * sort order (most recent activity first under the default sort), so "recent" is whatever
 * the list already says — no second recency model.
 *
 * The active scope always keeps a disc, even when it has fallen out of the top slots: a
 * scope the reader cannot see is a scope they cannot clear with one click.
 */
export function selectProjectScopePillGroups<TGroup extends { readonly projectKey: string }>(
  groups: ReadonlyArray<TGroup>,
  activeScopeKey: string | null,
  maxPills: number,
): ReadonlyArray<TGroup> {
  if (maxPills <= 0) return [];
  const pinned = groups.slice(0, maxPills);
  if (activeScopeKey === null || pinned.some((group) => group.projectKey === activeScopeKey)) {
    return pinned;
  }
  const active = groups.find((group) => group.projectKey === activeScopeKey);
  if (!active) return pinned;
  return [...pinned.slice(0, Math.max(0, maxPills - 1)), active];
}

/**
 * What clicking a Jira project that is not in the app yet does. "create" opens the Create-Project
 * wizard already pointed at that project; "disabled" leaves the pill inert with a tooltip. The
 * product call is still open, so this one switch flips the behaviour.
 */
export const ADD_PILL_CLICK_BEHAVIOR: "create" | "disabled" = "create";

/**
 * Splits an ordered list of scope items into the discs that fit and the overflow behind "+N".
 * When everything fits there is no overflow disc; otherwise one slot is reserved for it. The
 * active scope keeps a disc even when it would have overflowed.
 */
export function splitProjectScopePills<TItem extends { readonly projectKey: string }>(
  items: ReadonlyArray<TItem>,
  activeScopeKey: string | null,
  capacity: number,
): { readonly shown: ReadonlyArray<TItem>; readonly overflow: ReadonlyArray<TItem> } {
  // No room for a disc: every site is still one click away, behind the +N pill.
  if (capacity <= 0) return { shown: [], overflow: items };
  if (items.length <= capacity) return { shown: items, overflow: [] };
  const shown = selectProjectScopePillGroups(items, activeScopeKey, capacity - 1);
  const shownKeys = new Set(shown.map((item) => item.projectKey));
  return { shown, overflow: items.filter((item) => !shownKeys.has(item.projectKey)) };
}

/**
 * Depth of one disc in the stack: 0 for the selection (or "All" when nothing is selected),
 * one more per step away on either side, so the row reads as a pyramid with the selection
 * on top. `coveredSide` names the edge the disc one level up lies on.
 */
export function projectScopeDiscDepth(
  index: number,
  topIndex: number,
): { depth: number; coveredSide: "left" | "right" | null } {
  const depth = Math.abs(index - topIndex);
  return {
    depth,
    coveredSide: index < topIndex ? "right" : index > topIndex ? "left" : null,
  };
}

/** Shadow the disc one level up casts onto this one: blurrier and fainter further down. */
export function projectScopeCastShadow(depth: number): string {
  const blur = 4 + depth * 2.5;
  const spread = 1 + depth * 0.5;
  const alpha = Math.max(0.04, 0.14 - (depth - 1) * 0.03);
  return `0 0 ${blur}px ${spread}px rgba(0,0,0,${alpha})`;
}
