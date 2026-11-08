import {
  DEFAULT_VOICE_HOTKEY_CHORD,
  isModifierPairShortcut,
  type DesktopVoiceHotkeyState,
} from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { voiceHotkeyStatus } from "./t3team-voiceSettings.logic";
import { useSnapShotShortcutRecorder } from "./useSnapShotShortcutRecorder";

function VoiceHotkeyRow({ getState }: { getState: () => Promise<DesktopVoiceHotkeyState> }) {
  const chord = useClientSettings((settings) => settings.voiceHotkeyChord);
  const [state, setState] = useState<DesktopVoiceHotkeyState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      getState()
        .then(setState)
        .catch(() => setState(null)),
    [getState],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (next: typeof chord) => {
    setError(null);
    await updateClientSettings({ voiceHotkeyChord: next });
    await refresh();
  };
  const recorder = useSnapShotShortcutRecorder({
    shortcut: chord,
    allowModifierPairs: false,
    label: "voice shortcut",
    onStart: () => setError(null),
    onError: setError,
    onRecord: (shortcut) => {
      if (!isModifierPairShortcut(shortcut)) void save(shortcut);
    },
  });
  const isDefault = JSON.stringify(chord) === JSON.stringify(DEFAULT_VOICE_HOTKEY_CHORD);

  return (
    <SettingsRow
      {...searchableSetting("voice-hotkey")}
      description="Press this from any app to start or stop talking to the voice agent."
      status={
        recorder.recording ? "Press your shortcut. Esc cancels." : voiceHotkeyStatus(state, error)
      }
      resetAction={
        isDefault ? null : (
          <SettingResetButton
            label="voice shortcut"
            onClick={() => void save(DEFAULT_VOICE_HOTKEY_CHORD)}
          />
        )
      }
      control={recorder.input}
    />
  );
}

/** The global shortcut only exists in the desktop app, so the browser has nothing to configure. */
export function VoiceHotkeySettingRow() {
  const getState =
    typeof window === "undefined" ? undefined : window.desktopBridge?.getVoiceHotkeyState;
  return getState === undefined ? null : <VoiceHotkeyRow getState={getState} />;
}
