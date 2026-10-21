import { DEFAULT_VOICE_TRANSCRIBER_MODEL, type VoiceTranscriberSettings } from "@t3tools/contracts";

import { DraftInput } from "../ui/draft-input";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { nonEmptyVoiceField } from "./t3team-voiceSettings.logic";

type TranscriberField = keyof VoiceTranscriberSettings;

const DEFAULTS: VoiceTranscriberSettings = {
  model: DEFAULT_VOICE_TRANSCRIBER_MODEL,
  modelPath: "",
  language: "auto",
};

/** Model, model file and language of on-device transcription; saved on blur or Enter, never per keystroke. */
export function VoiceTranscriberSettingRows({
  transcriber,
  onChange,
}: {
  transcriber: VoiceTranscriberSettings;
  onChange: (patch: Partial<VoiceTranscriberSettings>) => void;
}) {
  const commit = (field: TranscriberField, raw: string, allowEmpty: boolean) => {
    const next = allowEmpty ? raw.trim() : nonEmptyVoiceField(raw);
    if (next !== null && next !== transcriber[field]) onChange({ [field]: next });
  };
  const reset = (field: TranscriberField, label: string) =>
    transcriber[field] === DEFAULTS[field] ? null : (
      <SettingResetButton label={label} onClick={() => onChange({ [field]: DEFAULTS[field] })} />
    );

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["voice"]}
        {...searchableSetting("voice-model")}
        description="Whisper model used for dictation. It is downloaded on first use if no copy is found on this computer."
        resetAction={reset("model", "voice model")}
        control={
          <DraftInput
            nativeInput
            size="sm"
            className="w-full sm:w-56"
            aria-label="Voice model"
            value={transcriber.model}
            onCommit={(next) => commit("model", next, false)}
          />
        }
      />
      <SettingsRow
        serverScoped
        settingKeys={["voice"]}
        {...searchableSetting("voice-model-path")}
        description="Use this ggml .bin file instead of detecting or downloading a model. Leave empty to detect automatically."
        resetAction={reset("modelPath", "voice model file")}
        control={
          <DraftInput
            nativeInput
            size="sm"
            font="mono"
            className="w-full sm:w-72"
            aria-label="Voice model file"
            placeholder="Automatic"
            value={transcriber.modelPath}
            onCommit={(next) => commit("modelPath", next, true)}
          />
        }
      />
      <SettingsRow
        serverScoped
        settingKeys={["voice"]}
        {...searchableSetting("voice-language")}
        description="ISO 639-1 code such as en or de, or auto to detect the language of each recording."
        resetAction={reset("language", "voice language")}
        control={
          <DraftInput
            nativeInput
            size="sm"
            className="w-full sm:w-28"
            aria-label="Voice language"
            value={transcriber.language}
            onCommit={(next) => commit("language", next, false)}
          />
        }
      />
    </>
  );
}
