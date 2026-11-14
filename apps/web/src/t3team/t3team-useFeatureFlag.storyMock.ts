import type { FeatureFlagKey } from "@t3tools/project-context/t3teamFeatureFlags";

import { useFeatureFlag as useServerFeatureFlag } from "./t3team-useFeatureFlag";

export { readServerFeatureFlag, readServerFeatureFlagOr } from "./t3team-useFeatureFlag";

const ADVERTISED_IN_STORYBOOK: ReadonlySet<FeatureFlagKey> = new Set([
  "UI_UPDATE_BADGE_ROW_ACTIONS",
]);

/**
 * Storybook-only stand-in for `useFeatureFlag`: stories have no live server, so the flags their
 * real components need are advertised here; every other flag reads as in the app. Wired up in
 * t3team-storybook-main.ts (alias on the exact module specifier).
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const advertised = useServerFeatureFlag(key);
  return ADVERTISED_IN_STORYBOOK.has(key) || advertised;
}
