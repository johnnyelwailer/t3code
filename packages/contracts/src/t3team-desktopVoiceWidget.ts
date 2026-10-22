import * as Schema from "effect/Schema";

/** Where the app serves the floating voice widget; the desktop shows it in a window of its own. */
export const VOICE_WIDGET_ROUTE_PATH = "/t3team-voice-widget";

/**
 * What the main window's voice session tells the floating widget. `idle` means no widget is
 * wanted. Level and partial transcript are not part of it: they already reach every window on
 * `desktop:voice-stream`, keyed by `sessionId`.
 */
export const DesktopVoiceWidgetSnapshot = Schema.Struct({
  state: Schema.Literals(["idle", "recording", "transcribing", "committed"]),
  sessionId: Schema.NullOr(Schema.String),
  /** Epoch ms the recording began; the widget derives its running timer from it. */
  startedAtMs: Schema.NullOr(Schema.Number),
  /** Epoch ms the recording stopped; freezes the timer while transcribing and after commit. */
  endedAtMs: Schema.NullOr(Schema.Number),
  heardText: Schema.NullOr(Schema.String),
  hotkeyLabel: Schema.NullOr(Schema.String),
});
export type DesktopVoiceWidgetSnapshot = typeof DesktopVoiceWidgetSnapshot.Type;

/** Widget to main window: `stop` ends the recording; `ready` asks main to resend the snapshot. */
export const DesktopVoiceWidgetCommand = Schema.Literals(["stop", "ready"]);
export type DesktopVoiceWidgetCommand = typeof DesktopVoiceWidgetCommand.Type;

/** How long the widget's exit animation runs; the desktop hides its window only after it. */
export const VOICE_WIDGET_EXIT_MS = 240;
