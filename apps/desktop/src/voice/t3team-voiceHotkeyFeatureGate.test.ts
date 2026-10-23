import { DEFAULT_VOICE_HOTKEY_CHORD } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  gateVoiceHotkeyRegistration,
  VOICE_HOTKEY_OFF_MESSAGE,
} from "./t3team-voiceHotkeyFeatureGate.ts";
import type { VoiceHotkeyRegistration } from "./t3team-voiceHotkeyRegistration.ts";

vi.mock("electron", () => ({ globalShortcut: {} }));

const registered: VoiceHotkeyRegistration = {
  state: () => ({ registered: true, accelerator: "Control+Alt+Space", message: null }),
  close: () => undefined,
};

describe("global voice hotkey behind DESKTOP_VOICE_HOTKEY", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it("never registers the shortcut while the flag is off (the default)", async () => {
    const register = vi.fn(() => Promise.resolve(registered));
    const registration = await gateVoiceHotkeyRegistration(
      register,
      {},
    )(DEFAULT_VOICE_HOTKEY_CHORD);
    expect(register).not.toHaveBeenCalled();
    expect(registration.state()).toEqual({
      registered: false,
      accelerator: "Control+Alt+Space",
      message: VOICE_HOTKEY_OFF_MESSAGE,
    });
  });

  it("registers it when the release preset or the env turns the flag on", async () => {
    const register = vi.fn(() => Promise.resolve(registered));
    replaceFeatureFlagPresetValues(new Map([["DESKTOP_VOICE_HOTKEY", true]]));
    await gateVoiceHotkeyRegistration(register, {})(DEFAULT_VOICE_HOTKEY_CHORD);
    replaceFeatureFlagPresetValues(new Map());
    await gateVoiceHotkeyRegistration(register, { NEXI_FF_DESKTOP_VOICE_HOTKEY: "1" })(
      DEFAULT_VOICE_HOTKEY_CHORD,
    );
    expect(register).toHaveBeenCalledTimes(2);
  });
});
