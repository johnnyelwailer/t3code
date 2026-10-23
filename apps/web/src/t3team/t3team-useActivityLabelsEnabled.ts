import { usePrimarySettings } from "~/hooks/useSettings";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

/** Activity labels show while the `UI_ACTIVITY_LABELS` flag and the user's setting are both on. */
export function useActivityLabelsEnabled(): boolean {
  const flagEnabled = useFeatureFlag("UI_ACTIVITY_LABELS");
  const settingEnabled = usePrimarySettings((settings) => settings.t3teamActivityLabelsEnabled);
  return flagEnabled && settingEnabled;
}
