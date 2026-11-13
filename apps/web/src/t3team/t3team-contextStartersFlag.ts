import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** Live server flag: Settings → Features turns the starters back on without a reload. */
export function useContextStartersEnabled(): boolean {
  return useFeatureFlag("CONTEXT_STARTERS");
}
