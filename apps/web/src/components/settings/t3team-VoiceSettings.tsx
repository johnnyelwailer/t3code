import type { VoiceTranscriberSettings } from "@t3tools/contracts";

import { SettingsSection } from "./settingsLayout";
import { VoiceHotkeySettingRow } from "./t3team-VoiceHotkeySettingRow";
import { VoiceTranscriberSettingRows } from "./t3team-VoiceTranscriberSettingRows";

/** On-device dictation is a desktop feature, so the section stays out of the browser app. */
export function T3TeamVoiceSettings({
  transcriber,
  onTranscriberChange,
}: {
  transcriber: VoiceTranscriberSettings;
  onTranscriberChange: (patch: Partial<VoiceTranscriberSettings>) => void;
}) {
  if (
    typeof window === "undefined" ||
    window.desktopBridge?.prepareVoiceTranscriber === undefined
  ) {
    return null;
  }
  return (
    <SettingsSection id="voice" title="Voice">
      <VoiceHotkeySettingRow />
      <VoiceTranscriberSettingRows transcriber={transcriber} onChange={onTranscriberChange} />
    </SettingsSection>
  );
}
