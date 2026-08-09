/**
 * Opt-in for adopting sessions started in the official Codex and Claude apps.
 *
 * Mounted at the fork's settings insertion seam rather than added to one of upstream's sections:
 * "Legacy features" is the only nearby home and this is the opposite of legacy, and adding a new
 * upstream section would widen the seam for one switch.
 *
 * A PRIMARY (server) setting, not a client one: the watcher that reads the provider profile folders
 * runs server-side, so the toggle has to reach it rather than living in this browser's local state.
 */
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { SettingsRow } from "./settingsLayout";
import { Switch } from "../ui/switch";

export function T3TeamLocalProviderSessionsSetting() {
  const showLocalProviderSessions = usePrimarySettings(
    (settings) => settings.showLocalProviderSessions,
  );
  const updatePrimarySettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      title="Local provider sessions"
      description="Watch the official Codex and Claude profile folders. Matching sessions appear in the project worktree they belong to and resume from the original native session — read-only here while that tool still owns them."
      control={
        <Switch
          checked={showLocalProviderSessions ?? false}
          onCheckedChange={(checked) =>
            updatePrimarySettings({ showLocalProviderSessions: Boolean(checked) })
          }
          aria-label="Show local provider sessions"
        />
      }
    />
  );
}
