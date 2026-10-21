// @vitest-environment jsdom
import {
  DEFAULT_VOICE_HOTKEY_CHORD,
  type DesktopVoiceHotkeyState,
  type VoiceHotkeyChord,
} from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const settings = vi.hoisted(() => ({
  chord: undefined as unknown as VoiceHotkeyChord,
  update: vi.fn<(patch: { voiceHotkeyChord: VoiceHotkeyChord }) => Promise<void>>(),
}));
vi.mock("../../hooks/useSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/useSettings")>()),
  useClientSettings: (select: (s: { voiceHotkeyChord: VoiceHotkeyChord }) => unknown) =>
    select({ voiceHotkeyChord: settings.chord }),
  useUpdateClientSettings: () => settings.update,
}));
vi.mock("../../lib/desktopSnapShot", () => ({
  getDesktopSnapShotBridge: () => ({ setSnapShotShortcutSuppressed: () => Promise.resolve() }),
}));

import { VoiceHotkeySettingRow } from "./t3team-VoiceHotkeySettingRow";

const REGISTERED: DesktopVoiceHotkeyState = {
  registered: true,
  accelerator: "Control+Alt+Space",
  message: null,
};
const CLASH: DesktopVoiceHotkeyState = {
  registered: false,
  accelerator: "Control+Shift+V",
  message: "This shortcut is already used by the system or another app.",
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(<VoiceHotkeySettingRow />);
  });
  return container;
}

function installBridge(states: readonly DesktopVoiceHotkeyState[]) {
  const getVoiceHotkeyState = vi.fn<() => Promise<DesktopVoiceHotkeyState>>();
  getVoiceHotkeyState.mockResolvedValue(states.at(-1)!);
  for (const state of states) getVoiceHotkeyState.mockResolvedValueOnce(state);
  Object.defineProperty(window, "desktopBridge", {
    value: { getVoiceHotkeyState },
    configurable: true,
  });
  return getVoiceHotkeyState;
}

beforeEach(() => {
  settings.chord = DEFAULT_VOICE_HOTKEY_CHORD;
  settings.update.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  Reflect.deleteProperty(window, "desktopBridge");
});

describe("VoiceHotkeySettingRow", () => {
  it("renders nothing in a browser without the desktop bridge", async () => {
    const node = await render();
    expect(node.textContent).toBe("");
  });

  it("shows the live shortcut and the active registration", async () => {
    installBridge([REGISTERED]);
    const node = await render();
    expect(node.textContent).toContain("Voice shortcut");
    expect(node.textContent).toContain("Active: Control+Alt+Space");
    expect(
      node.querySelector('button[aria-label^="Record voice shortcut, currently"]'),
    ).not.toBeNull();
    expect(node.querySelector('button[aria-label^="Reset"]')).toBeNull();
  });

  it("explains a chord the OS refused and offers the default back", async () => {
    settings.chord = { ...DEFAULT_VOICE_HOTKEY_CHORD, key: "v", altKey: false, shiftKey: true };
    installBridge([CLASH]);
    const node = await render();
    expect(node.textContent).toContain(
      "Control+Shift+V isn't available. This shortcut is already used by the system or another app. Choose a different shortcut.",
    );
    const reset = node.querySelector('button[aria-label="Reset voice shortcut to default"]');
    expect(reset).not.toBeNull();

    await act(async () => (reset as HTMLButtonElement).click());
    expect(settings.update).toHaveBeenCalledExactlyOnceWith({
      voiceHotkeyChord: DEFAULT_VOICE_HOTKEY_CHORD,
    });
  });

  it("saves a recorded chord, then re-reads the registration state", async () => {
    const getState = installBridge([REGISTERED, CLASH]);
    const node = await render();
    const button = node.querySelector(
      'button[aria-label^="Record voice shortcut"]',
    ) as HTMLButtonElement;

    await act(async () => button.click());
    await act(async () => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "v",
          code: "KeyV",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(settings.update).toHaveBeenCalledTimes(1);
    const saved = settings.update.mock.calls[0]![0].voiceHotkeyChord;
    expect(saved).toMatchObject({ key: "v", shiftKey: true, altKey: false });
    expect(saved.ctrlKey || saved.modKey).toBe(true);
    expect(getState).toHaveBeenCalledTimes(2);
    expect(node.textContent).toContain("Control+Shift+V isn't available.");
  });
});
