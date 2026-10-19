/**
 * The global voice shortcut. It is a TOGGLE: every OS-level global-shortcut path (Electron's
 * `globalShortcut`, the modifier-pair pollers, the Wayland portal's `Activated`) reports presses
 * only, never releases, so press-to-start / press-again-to-stop is the one semantic they can all
 * deliver. Mirrors the snap-shot registration path; works while the app is unfocused.
 */
import type { DesktopVoiceHotkeyState, SnapShotKeyChord } from "@t3tools/contracts";
import * as Electron from "electron";

import { probeGlobalShortcut } from "../snapShot/t3team-globalShortcutProbe.ts";
import { isWaylandSession, toElectronAccelerator } from "../snapShot/snapShot.ts";

/** Ctrl+Alt+Space: unclaimed by the OS on Windows, macOS and the common Linux desktops. */
export const VOICE_HOTKEY_CHORD: SnapShotKeyChord = {
  key: " ",
  ctrlKey: true,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  modKey: false,
};

const PORTAL_BINDING = { idPrefix: "t3-voice", description: "Talk to the voice agent" } as const;

export interface VoiceHotkeyRegistration {
  readonly state: () => DesktopVoiceHotkeyState;
  readonly close: () => void;
}

export interface VoiceHotkeyRegistrationInput {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly linuxAppId: string;
  readonly onPress: () => void;
  readonly shortcuts?: Pick<Electron.GlobalShortcut, "register" | "unregister">;
  readonly probe?: typeof probeGlobalShortcut;
}

const unavailable = (accelerator: string, message: string): VoiceHotkeyRegistration => ({
  state: () => ({ registered: false, accelerator, message }),
  close: () => undefined,
});

function registerElectronShortcut(
  input: VoiceHotkeyRegistrationInput,
  accelerator: string,
): VoiceHotkeyRegistration {
  const probe = (input.probe ?? probeGlobalShortcut)(accelerator);
  if (!probe.available) return unavailable(accelerator, probe.message ?? "");
  const shortcuts = input.shortcuts ?? Electron.globalShortcut;
  if (!shortcuts.register(accelerator, input.onPress)) {
    return unavailable(accelerator, "This shortcut is already used by the system or another app.");
  }
  return {
    state: () => ({ registered: true, accelerator, message: null }),
    close: () => shortcuts.unregister(accelerator),
  };
}

async function registerPortalShortcut(
  input: VoiceHotkeyRegistrationInput,
  accelerator: string,
): Promise<VoiceHotkeyRegistration> {
  try {
    const { PortalCaptureShortcut } = await import("../snapShot/PortalCaptureShortcut.ts");
    const portal = new PortalCaptureShortcut(
      input.linuxAppId,
      VOICE_HOTKEY_CHORD,
      input.onPress,
      () => undefined,
      undefined,
      false,
      PORTAL_BINDING,
    );
    await portal.ready;
    return {
      state: () => ({
        registered: portal.state.shortcutRegistered,
        accelerator,
        message: portal.state.shortcutMessage,
      }),
      close: portal.close,
    };
  } catch (error) {
    return unavailable(
      accelerator,
      error instanceof Error
        ? error.message
        : "Could not connect to your desktop's shortcut service.",
    );
  }
}

export async function registerVoiceHotkey(
  input: VoiceHotkeyRegistrationInput,
): Promise<VoiceHotkeyRegistration> {
  const accelerator = toElectronAccelerator(VOICE_HOTKEY_CHORD);
  if (input.platform === "linux" && isWaylandSession(input.platform, input.env)) {
    return registerPortalShortcut(input, accelerator);
  }
  return registerElectronShortcut(input, accelerator);
}
