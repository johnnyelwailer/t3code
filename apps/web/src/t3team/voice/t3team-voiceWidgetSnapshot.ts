import type { DesktopVoiceWidgetSnapshot } from "@t3tools/contracts";

import { voiceUiIsLive, type VoiceUiSnapshot } from "./surface/t3team-voiceUiModel";

const KEY_SEPARATOR = "+";

/** What the floating widget is told: only the live states show, everything else is "no widget". */
export function toWidgetSnapshot(
  snapshot: VoiceUiSnapshot,
  keys: readonly string[],
): DesktopVoiceWidgetSnapshot {
  return {
    state: voiceUiIsLive(snapshot.state) ? snapshot.state : "idle",
    sessionId: snapshot.sessionId,
    startedAtMs: snapshot.startedAtMs,
    endedAtMs: snapshot.endedAtMs,
    heardText: snapshot.heardText,
    hotkeyLabel: keys.length === 0 ? null : keys.join(KEY_SEPARATOR),
  };
}

/** The widget's view of a snapshot from the main window; the inverse of {@link toWidgetSnapshot}. */
export function fromWidgetSnapshot(widget: DesktopVoiceWidgetSnapshot): VoiceUiSnapshot {
  return {
    state: widget.state,
    sessionId: widget.sessionId,
    startedAtMs: widget.startedAtMs,
    endedAtMs: widget.endedAtMs,
    heardText: widget.heardText,
    tier: null,
    downloadPercent: null,
    failureDetail: null,
  };
}

export const widgetHotkeyKeys = (widget: DesktopVoiceWidgetSnapshot): readonly string[] =>
  widget.hotkeyLabel === null ? [] : widget.hotkeyLabel.split(KEY_SEPARATOR).filter(Boolean);
