import { describe, expect, it } from "vite-plus/test";

import {
  fromWidgetSnapshot,
  toWidgetSnapshot,
  widgetHotkeyKeys,
} from "./t3team-voiceWidgetSnapshot";
import { IDLE_VOICE_UI, type VoiceUiSnapshot } from "./surface/t3team-voiceUiModel";

const recording: VoiceUiSnapshot = {
  ...IDLE_VOICE_UI,
  state: "recording",
  sessionId: "s1",
  startedAtMs: 100,
};

describe("widget snapshot", () => {
  it("asks for no widget outside the live states", () => {
    for (const state of ["idle", "preparing", "failed", "denied"] as const) {
      expect(toWidgetSnapshot({ ...IDLE_VOICE_UI, state }, []).state).toBe("idle");
    }
  });

  it("carries the recording and the shortcut to the widget and back", () => {
    const widget = toWidgetSnapshot(recording, ["Ctrl", "Alt", "Space"]);
    expect(widget).toMatchObject({ state: "recording", sessionId: "s1", startedAtMs: 100 });
    expect(widgetHotkeyKeys(widget)).toEqual(["Ctrl", "Alt", "Space"]);
    expect(fromWidgetSnapshot(widget)).toMatchObject({ state: "recording", startedAtMs: 100 });
  });

  it("has no shortcut label when the app has no global shortcut", () => {
    const widget = toWidgetSnapshot(recording, []);
    expect(widget.hotkeyLabel).toBeNull();
    expect(widgetHotkeyKeys(widget)).toEqual([]);
  });
});
