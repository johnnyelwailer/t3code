import type { DesktopSnapShotShortcutAvailability } from "@t3tools/contracts";
import * as Electron from "electron";

/** Whether the OS would grant this accelerator to us, without keeping the registration. */
export function probeGlobalShortcut(accelerator: string): DesktopSnapShotShortcutAvailability {
  try {
    if (!Electron.globalShortcut.register(accelerator, () => undefined)) {
      return {
        available: false,
        message: "This shortcut is already used by the system or another app.",
      };
    }
    Electron.globalShortcut.unregister(accelerator);
    return { available: true, message: null };
  } catch {
    return { available: false, message: "The system could not register this shortcut." };
  }
}
