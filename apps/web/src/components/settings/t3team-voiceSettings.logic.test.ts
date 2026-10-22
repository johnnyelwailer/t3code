import { describe, expect, it } from "vite-plus/test";

import {
  nonEmptyVoiceField,
  voiceSilenceMsField,
  voiceHotkeyStatus,
} from "./t3team-voiceSettings.logic";

describe("voiceHotkeyStatus", () => {
  it("says nothing before the main process has answered", () => {
    expect(voiceHotkeyStatus(null, null)).toBeUndefined();
  });

  it("confirms the live shortcut", () => {
    expect(
      voiceHotkeyStatus(
        { registered: true, accelerator: "Control+Alt+Space", message: null },
        null,
      ),
    ).toBe("Active: Control+Alt+Space");
  });

  it("explains a clash and asks for another shortcut", () => {
    expect(
      voiceHotkeyStatus(
        {
          registered: false,
          accelerator: "Control+Alt+Space",
          message: "This shortcut is already used by the system or another app.",
        },
        null,
      ),
    ).toBe(
      "Control+Alt+Space isn't available. This shortcut is already used by the system or another app. Choose a different shortcut.",
    );
  });

  it("shows a pending registration without a failure", () => {
    expect(
      voiceHotkeyStatus({ registered: false, accelerator: "Control+Alt+V", message: null }, null),
    ).toBe("Registering Control+Alt+V…");
  });

  it("lets a recording error win over the registration state", () => {
    expect(voiceHotkeyStatus(null, "Add a letter, number, or function key to your shortcut.")).toBe(
      "Add a letter, number, or function key to your shortcut.",
    );
  });
});

describe("nonEmptyVoiceField", () => {
  it("trims, and refuses a cleared field", () => {
    expect(nonEmptyVoiceField("  large-v3  ")).toBe("large-v3");
    expect(nonEmptyVoiceField("   ")).toBeNull();
  });
});

describe("voiceSilenceMsField", () => {
  it("reads whole milliseconds and clamps to what the setting accepts", () => {
    expect(voiceSilenceMsField(" 1200 ")).toBe(1200);
    expect(voiceSilenceMsField("0")).toBe(0);
    expect(voiceSilenceMsField("-5")).toBe(0);
    expect(voiceSilenceMsField("999999")).toBe(10_000);
  });

  it("refuses text that is not a number", () => {
    expect(voiceSilenceMsField("soon")).toBeNull();
    expect(voiceSilenceMsField("")).toBeNull();
  });
});
