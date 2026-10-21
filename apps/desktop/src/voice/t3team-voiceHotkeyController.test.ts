import { DEFAULT_VOICE_HOTKEY_CHORD, type VoiceHotkeyChord } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { makeVoiceHotkeyController } from "./t3team-voiceHotkeyController.ts";
import type { VoiceHotkeyRegistration } from "./t3team-voiceHotkeyRegistration.ts";

vi.mock("electron", () => ({ globalShortcut: {} }));

const CTRL_SHIFT_V: VoiceHotkeyChord = {
  ...DEFAULT_VOICE_HOTKEY_CHORD,
  key: "v",
  altKey: false,
  shiftKey: true,
};

const makeRegistration = (accelerator: string, registered = true) => {
  const close = vi.fn();
  const registration: VoiceHotkeyRegistration = {
    state: () => ({
      registered,
      accelerator,
      message: registered ? null : "This shortcut is already used by the system or another app.",
    }),
    close,
  };
  return { registration, close };
};

describe("makeVoiceHotkeyController", () => {
  it("reports the default accelerator as pending before any chord is applied", () => {
    const controller = makeVoiceHotkeyController(() => Promise.reject(new Error("unused")));
    expect(controller.state()).toEqual({
      registered: false,
      accelerator: "Control+Alt+Space",
      message: null,
    });
  });

  it("re-registers when the chord changes and closes the previous registration", async () => {
    const first = makeRegistration("Control+Alt+Space");
    const second = makeRegistration("Control+Shift+V");
    const register = vi
      .fn<(chord: VoiceHotkeyChord) => Promise<VoiceHotkeyRegistration>>()
      .mockResolvedValueOnce(first.registration)
      .mockResolvedValueOnce(second.registration);
    const controller = makeVoiceHotkeyController(register);

    controller.apply(DEFAULT_VOICE_HOTKEY_CHORD);
    await Promise.resolve();
    controller.apply(DEFAULT_VOICE_HOTKEY_CHORD);
    expect(register).toHaveBeenCalledTimes(1);

    controller.apply(CTRL_SHIFT_V);
    await Promise.resolve();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenLastCalledWith(CTRL_SHIFT_V);
    expect(controller.state().accelerator).toBe("Control+Shift+V");
  });

  it("surfaces the clash of a refused chord as the state message", async () => {
    const refused = makeRegistration("Control+Shift+V", false);
    const controller = makeVoiceHotkeyController(() => Promise.resolve(refused.registration));
    controller.apply(CTRL_SHIFT_V);
    await Promise.resolve();
    expect(controller.state()).toEqual({
      registered: false,
      accelerator: "Control+Shift+V",
      message: "This shortcut is already used by the system or another app.",
    });
  });

  it("drops an older registration that resolves after a newer chord was applied", async () => {
    const slow = makeRegistration("Control+Alt+Space");
    const fast = makeRegistration("Control+Shift+V");
    let resolveSlow: (registration: VoiceHotkeyRegistration) => void = () => undefined;
    const register = vi
      .fn<(chord: VoiceHotkeyChord) => Promise<VoiceHotkeyRegistration>>()
      .mockReturnValueOnce(new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce(fast.registration);
    const controller = makeVoiceHotkeyController(register);

    controller.apply(DEFAULT_VOICE_HOTKEY_CHORD);
    controller.apply(CTRL_SHIFT_V);
    await Promise.resolve();
    resolveSlow(slow.registration);
    await Promise.resolve();

    expect(slow.close).toHaveBeenCalledTimes(1);
    expect(controller.state().accelerator).toBe("Control+Shift+V");
  });

  it("closes the live registration on close", async () => {
    const live = makeRegistration("Control+Alt+Space");
    const controller = makeVoiceHotkeyController(() => Promise.resolve(live.registration));
    controller.apply(DEFAULT_VOICE_HOTKEY_CHORD);
    await Promise.resolve();
    controller.close();
    expect(live.close).toHaveBeenCalledTimes(1);
  });
});
