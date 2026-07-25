import { useClientSettings } from "~/hooks/useSettings";

/**
 * Which sidebar presentation the T3 Team shell is showing.
 *
 * T3 Team is the permanent shell; the lens only changes sidebar presentation.
 * The fork deliberately ships **no** control of its own — upstream owns the
 * switch. Today that switch is upstream's `sidebarV2Enabled` client setting
 * (Settings → Beta); when upstream replaces it with a first-class Code/Work
 * toggle, `useT3TeamSidebarLens` is the single place to re-point.
 */
export type T3TeamSidebarLens = "code" | "work";

/** Pure so route/lens behaviour can be asserted without rendering the shell. */
export function resolveT3TeamSidebarLens(input: {
  readonly inboxSidebarEnabled: boolean;
}): T3TeamSidebarLens {
  return input.inboxSidebarEnabled ? "work" : "code";
}

export function useT3TeamSidebarLens(): T3TeamSidebarLens {
  const inboxSidebarEnabled = useClientSettings((settings) => settings.sidebarV2Enabled);
  return resolveT3TeamSidebarLens({ inboxSidebarEnabled });
}
