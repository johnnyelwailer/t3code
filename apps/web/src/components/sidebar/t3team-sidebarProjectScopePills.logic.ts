/**
 * Which project groups get a one-click pill in the sidebar header. The input is the sidebar's
 * project list in its current sort order (most recent activity first under the default sort), so
 * "recent" is whatever the list already says — no second recency model.
 *
 * The active scope always keeps a pill, even when it has fallen out of the top slots: a scope the
 * reader cannot see is a scope they cannot clear with one click.
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
