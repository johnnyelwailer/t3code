import { appViewRegistry } from "../../t3team/packs/t3team-appViewRegistry";
import {
  DEFAULT_T3TEAM_COMPANION_ENABLED,
  useT3TeamCompanionEnabled,
} from "../../t3team/packs/t3team-companionSetting";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { Switch } from "../ui/switch";

/** Hidden when no pack registers a companion: the switch would have nothing to show. */
export function T3TeamCompanionSetting() {
  return appViewRegistry().list("surface.companion").length > 0 ? <CompanionSettingRow /> : null;
}

function CompanionSettingRow() {
  const [enabled, setEnabled] = useT3TeamCompanionEnabled();
  return (
    <SettingsRow
      id="t3team-companion"
      title="Animated companion"
      description="Show the pack's animated character on empty threads, My Work and the voice overlay. Uses 3D graphics; this device only."
      resetAction={
        enabled !== DEFAULT_T3TEAM_COMPANION_ENABLED ? (
          <SettingResetButton
            label="animated companion"
            onClick={() => setEnabled(DEFAULT_T3TEAM_COMPANION_ENABLED)}
          />
        ) : null
      }
      control={
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          aria-label="Show the animated companion"
        />
      }
    />
  );
}
