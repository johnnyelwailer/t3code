import { describe, expect, it } from "vite-plus/test";

import {
  VOICE_WIDGET_MARGIN,
  VOICE_WIDGET_SIZE,
  voiceWidgetBounds,
  voiceWidgetUrl,
} from "./t3team-voiceWidgetPlacement.ts";
import { microphoneSettingsUrl } from "./t3team-microphoneSettingsUrl.ts";

describe("voiceWidgetBounds", () => {
  it("anchors to the bottom-right of a work area that does not start at the origin", () => {
    const bounds = voiceWidgetBounds({ x: 1920, y: 0, width: 1920, height: 1040 });
    expect(bounds.x + bounds.width).toBe(1920 + 1920 - VOICE_WIDGET_MARGIN);
    expect(bounds.y + bounds.height).toBe(1040 - VOICE_WIDGET_MARGIN);
    expect(bounds.width).toBe(VOICE_WIDGET_SIZE.width);
  });
});

describe("microphoneSettingsUrl", () => {
  it("has a page on windows and macOS only", () => {
    expect(microphoneSettingsUrl("win32")).toBe("ms-settings:privacy-microphone");
    expect(microphoneSettingsUrl("darwin")).toContain("Privacy_Microphone");
    expect(microphoneSettingsUrl("linux")).toBeNull();
  });
});

describe("voiceWidgetUrl", () => {
  it("routes by hash on the desktop scheme", () => {
    expect(voiceWidgetUrl("t3code://app/")).toBe("t3code://app/#/t3team-voice-widget");
  });
});
