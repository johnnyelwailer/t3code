import { DEFAULT_VOICE_LANGUAGES, type VoiceTranscriberSettings } from "@t3tools/contracts";

import { DraftInput } from "../ui/draft-input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import {
  VOICE_LANGUAGE_AUTO,
  formatVoiceLanguages,
  voiceLanguageOptions,
} from "./t3team-voiceLanguages.logic";

/**
 * The language picker and the list it offers. Picking a language pins every recording to it;
 * Auto, the default, hands detection back to whisper (see the stream session's language lock).
 */
export function VoiceLanguageSettingRows({
  transcriber,
  onChange,
}: {
  transcriber: VoiceTranscriberSettings;
  onChange: (patch: Partial<VoiceTranscriberSettings>) => void;
}) {
  const options = voiceLanguageOptions(transcriber.languages, transcriber.language);
  const selected = transcriber.language.trim().toLowerCase();
  const commitList = (raw: string) => {
    const next = formatVoiceLanguages(raw);
    if (next !== transcriber.languages) onChange({ languages: next });
  };

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["voice"]}
        {...searchableSetting("voice-language")}
        description="Auto detects the language of each recording from its first seconds of speech. Choose a language to use it for every recording without detection."
        resetAction={
          selected === VOICE_LANGUAGE_AUTO ? null : (
            <SettingResetButton
              label="voice language"
              onClick={() => onChange({ language: VOICE_LANGUAGE_AUTO })}
            />
          )
        }
        control={
          <Select
            value={selected}
            onValueChange={(value) => {
              if (value !== null && value !== selected) onChange({ language: value });
            }}
          >
            <SelectTrigger size="sm" aria-label="Voice language">
              <SelectValue>
                {(value: string | null) =>
                  options.find((option) => option.value === value)?.label ?? "Auto"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        serverScoped
        settingKeys={["voice"]}
        {...searchableSetting("voice-languages")}
        description="Languages the picker offers after Auto, as comma-separated ISO 639-1 codes such as de,en,fr."
        resetAction={
          transcriber.languages === DEFAULT_VOICE_LANGUAGES ? null : (
            <SettingResetButton
              label="voice language list"
              onClick={() => onChange({ languages: DEFAULT_VOICE_LANGUAGES })}
            />
          )
        }
        control={
          <DraftInput
            nativeInput
            size="sm"
            font="mono"
            className="w-full sm:w-40"
            aria-label="Voice language list"
            value={transcriber.languages}
            onCommit={commitList}
          />
        }
      />
    </>
  );
}
