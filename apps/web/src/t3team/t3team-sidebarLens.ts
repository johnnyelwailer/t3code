import { useT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

/**
 * Which sidebar presentation the T3 Team shell is showing.
 *
 * T3 Team is the permanent shell; the lens only changes sidebar presentation. Upstream removed its
 * legacy-sidebar switch, so the lens is the pack theme's `sidebarLens`, and otherwise upstream's
 * current sidebar (the Inbox, "work").
 */
export type T3TeamSidebarLens = "code" | "work";

/** Pure so route/lens behaviour can be asserted without rendering the shell. */
export function resolveT3TeamSidebarLens(input: {
  readonly packLens: T3TeamSidebarLens | undefined;
}): T3TeamSidebarLens {
  return input.packLens ?? "work";
}

export function useT3TeamSidebarLens(): T3TeamSidebarLens {
  const packLens = useT3TeamPackAppearance()?.appearanceDefaults?.sidebarLens;
  return resolveT3TeamSidebarLens({ packLens });
}
