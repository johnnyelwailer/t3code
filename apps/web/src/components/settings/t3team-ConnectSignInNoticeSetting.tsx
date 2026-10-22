import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";

import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Presentational row, so stories can show both states without app settings. */
export function ConnectSignInNoticeSettingRow({
  enabled,
  onEnabledChange,
}: {
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <SettingsRow
      title={searchableSetting("t3-connect-sign-in-notice").title}
      description="Show a small sidebar notice when cloud sessions need your T3 Connect sign-in. Your browser only opens when you click it."
      control={
        <Switch
          aria-label="Show T3 Connect sign-in reminder"
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(Boolean(checked))}
        />
      }
    />
  );
}

/**
 * Turns the sidebar "Sign in to T3 Connect" notice on or off. The sign-in never opens a browser
 * on its own either way; this only decides whether the reminder appears.
 */
export function ConnectSignInNoticeSetting() {
  const enabled = useClientSettings((settings) => settings.t3ConnectSignInNoticeEnabled);
  const updateClientSettings = useUpdateClientSettings();
  return (
    <ConnectSignInNoticeSettingRow
      enabled={enabled}
      onEnabledChange={(next) => void updateClientSettings({ t3ConnectSignInNoticeEnabled: next })}
    />
  );
}
