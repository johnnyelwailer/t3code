import { MAX_VOICE_SILENCE_MS, type DesktopVoiceHotkeyState } from "@t3tools/contracts";

/** What the shortcut row says under its description; a refused chord is a failure, not a silent no-op. */
export function voiceHotkeyStatus(
  state: DesktopVoiceHotkeyState | null,
  error: string | null,
): string | undefined {
  if (error !== null) return error;
  if (state === null) return undefined;
  if (state.registered) return `Active: ${state.accelerator}`;
  return state.message === null
    ? `Registering ${state.accelerator}…`
    : `${state.accelerator} isn't available. ${state.message} Choose a different shortcut.`;
}

/** `model` and `language` have no empty value; a cleared field keeps the saved one. */
export function nonEmptyVoiceField(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Whole milliseconds clamped to what the setting accepts; null when the text is not a number. */
export function voiceSilenceMsField(raw: string): number | null {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isNaN(parsed) ? null : Math.min(MAX_VOICE_SILENCE_MS, Math.max(0, parsed));
}
