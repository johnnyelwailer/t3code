import type { DesktopVoiceHotkeyState } from "@t3tools/contracts";

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
