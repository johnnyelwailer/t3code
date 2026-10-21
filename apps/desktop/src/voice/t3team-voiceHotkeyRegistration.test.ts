import { DEFAULT_VOICE_HOTKEY_CHORD } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({
  globalShortcut: { register: vi.fn(() => false), unregister: vi.fn() },
}));

import {
  registerVoiceHotkey,
  type VoiceHotkeyRegistrationInput,
} from "./t3team-voiceHotkeyRegistration.ts";

const baseInput = (
  overrides: Partial<VoiceHotkeyRegistrationInput>,
): VoiceHotkeyRegistrationInput => ({
  chord: DEFAULT_VOICE_HOTKEY_CHORD,
  platform: "win32",
  env: {},
  linuxAppId: "t3code",
  onPress: () => undefined,
  ...overrides,
});

describe("registerVoiceHotkey", () => {
  it("registers Ctrl+Alt+Space globally and unregisters it on close", async () => {
    const shortcuts = { register: vi.fn(() => true), unregister: vi.fn() };
    const onPress = vi.fn();
    const registration = await registerVoiceHotkey(
      baseInput({ shortcuts, onPress, probe: () => ({ available: true, message: null }) }),
    );
    expect(registration.state()).toEqual({
      registered: true,
      accelerator: "Control+Alt+Space",
      message: null,
    });
    expect(shortcuts.register).toHaveBeenCalledWith("Control+Alt+Space", onPress);
    registration.close();
    expect(shortcuts.unregister).toHaveBeenCalledWith("Control+Alt+Space");
  });

  it("registers the configured chord instead of the default", async () => {
    const shortcuts = { register: vi.fn(() => true), unregister: vi.fn() };
    const registration = await registerVoiceHotkey(
      baseInput({
        shortcuts,
        chord: { ...DEFAULT_VOICE_HOTKEY_CHORD, key: "v", altKey: false, shiftKey: true },
        probe: () => ({ available: true, message: null }),
      }),
    );
    expect(registration.state().accelerator).toBe("Control+Shift+V");
    expect(shortcuts.register).toHaveBeenCalledWith("Control+Shift+V", expect.any(Function));
    registration.close();
    expect(shortcuts.unregister).toHaveBeenCalledWith("Control+Shift+V");
  });

  it("reports a clash found by the probe without registering", async () => {
    const shortcuts = { register: vi.fn(() => true), unregister: vi.fn() };
    const registration = await registerVoiceHotkey(
      baseInput({
        shortcuts,
        probe: () => ({
          available: false,
          message: "This shortcut is already used by the system.",
        }),
      }),
    );
    expect(registration.state()).toEqual({
      registered: false,
      accelerator: "Control+Alt+Space",
      message: "This shortcut is already used by the system.",
    });
    expect(shortcuts.register).not.toHaveBeenCalled();
    expect(() => registration.close()).not.toThrow();
  });

  it("reports a registration the OS refuses after a clean probe", async () => {
    const shortcuts = { register: vi.fn(() => false), unregister: vi.fn() };
    const registration = await registerVoiceHotkey(
      baseInput({ shortcuts, probe: () => ({ available: true, message: null }) }),
    );
    expect(registration.state().registered).toBe(false);
    expect(registration.state().message).toContain("already used");
  });

  it("survives a Wayland session whose shortcut portal is absent", async () => {
    const registration = await registerVoiceHotkey(
      baseInput({ platform: "linux", env: { XDG_SESSION_TYPE: "wayland" } }),
    );
    expect(registration.state().registered).toBe(false);
    expect(registration.state().message).toEqual(expect.any(String));
    expect(() => registration.close()).not.toThrow();
  });
});
