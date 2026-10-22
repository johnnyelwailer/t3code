// @vitest-environment jsdom
import type { DesktopVoiceModelProgress } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useVoiceModelProgressPercent } from "./t3team-useVoiceModelProgress";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Probe({ active }: { active: boolean }) {
  return <p>{String(useVoiceModelProgressPercent(active))}</p>;
}

function mount(active: boolean) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<Probe active={active} />);
  });
}

function installBridge() {
  let listener: (progress: DesktopVoiceModelProgress) => void = () => undefined;
  const unsubscribe = vi.fn();
  const onVoiceModelProgress = vi.fn((next: typeof listener) => {
    listener = next;
    return unsubscribe;
  });
  Object.defineProperty(window, "desktopBridge", {
    value: { onVoiceModelProgress },
    configurable: true,
  });
  return {
    emit: (progress: DesktopVoiceModelProgress) => act(() => listener(progress)),
    unsubscribe,
    onVoiceModelProgress,
  };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  Reflect.deleteProperty(window, "desktopBridge");
});

describe("useVoiceModelProgressPercent", () => {
  it("follows download progress while preparing", () => {
    const bridge = installBridge();
    mount(true);
    expect(container!.textContent).toBe("null");
    bridge.emit({ receivedBytes: 430, totalBytes: 1000 });
    expect(container!.textContent).toBe("43");
  });

  it("does not subscribe while idle and unsubscribes on unmount", () => {
    const bridge = installBridge();
    mount(false);
    expect(bridge.onVoiceModelProgress).not.toHaveBeenCalled();
    act(() => root!.render(<Probe active />));
    expect(bridge.onVoiceModelProgress).toHaveBeenCalledTimes(1);
    act(() => root!.unmount());
    root = null;
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("stays null in a browser without the desktop bridge", () => {
    mount(true);
    expect(container!.textContent).toBe("null");
  });
});
