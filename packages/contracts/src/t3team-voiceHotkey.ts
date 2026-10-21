import * as Schema from "effect/Schema";

import { MAX_KEYBINDING_VALUE_LENGTH } from "./keybindings.ts";

/** Menu action the main process sends when the global voice hotkey is pressed (toggle). */
export const VOICE_HOTKEY_TOGGLE_ACTION = "voice-toggle";

/**
 * A `KeybindingShortcut` whose key is not trimmed: Space is the key " ", which the trimmed
 * `KeybindingValue` would reduce to an empty string and reject. A global shortcut without a modifier
 * would take that key away from every other app.
 */
export const VoiceHotkeyChord = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_KEYBINDING_VALUE_LENGTH)),
  metaKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  modKey: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (chord) =>
      chord.metaKey ||
      chord.ctrlKey ||
      chord.shiftKey ||
      chord.altKey ||
      chord.modKey ||
      "Voice shortcut requires a modifier.",
  ),
);
export type VoiceHotkeyChord = typeof VoiceHotkeyChord.Type;

/** Ctrl+Alt+Space: unclaimed by the OS on Windows, macOS and the common Linux desktops. */
export const DEFAULT_VOICE_HOTKEY_CHORD: VoiceHotkeyChord = {
  key: " ",
  ctrlKey: true,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  modKey: false,
};

/** Whether the OS accepted the global voice shortcut; `message` says why not when it did not. */
export const DesktopVoiceHotkeyState = Schema.Struct({
  registered: Schema.Boolean,
  accelerator: Schema.String,
  message: Schema.NullOr(Schema.String),
});
export type DesktopVoiceHotkeyState = typeof DesktopVoiceHotkeyState.Type;
