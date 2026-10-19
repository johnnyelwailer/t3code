import * as Schema from "effect/Schema";

/** Menu action the main process sends when the global voice hotkey is pressed (toggle). */
export const VOICE_HOTKEY_TOGGLE_ACTION = "voice-toggle";

/** Whether the OS accepted the global voice shortcut; `message` says why not when it did not. */
export const DesktopVoiceHotkeyState = Schema.Struct({
  registered: Schema.Boolean,
  accelerator: Schema.String,
  message: Schema.NullOr(Schema.String),
});
export type DesktopVoiceHotkeyState = typeof DesktopVoiceHotkeyState.Type;
