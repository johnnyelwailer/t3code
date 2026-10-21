// @vitest-environment jsdom
import type { DesktopVoiceStreamEvent } from "@t3tools/contracts";
import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useVoiceStream } from "./t3team-useVoiceStream";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function installBridge() {
  let listener: (event: DesktopVoiceStreamEvent) => void = () => undefined;
  const unsubscribe = vi.fn();
  Object.defineProperty(window, "desktopBridge", {
    value: {
      onVoiceStream: (next: typeof listener) => {
        listener = next;
        return unsubscribe;
      },
    },
    configurable: true,
  });
  return {
    emit: (event: DesktopVoiceStreamEvent) => act(() => listener(event)),
    unsubscribe,
  };
}

function mount(sessionId: string | null) {
  const sessionIdRef: RefObject<string | null> = { current: sessionId };
  const onAutoCommit = vi.fn();
  const onLanguage = vi.fn();
  function Probe({ active }: { active: boolean }) {
    const view = useVoiceStream({ active, sessionIdRef, onAutoCommit, onLanguage });
    return <p>{JSON.stringify(view)}</p>;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<Probe active />);
  });
  return { onAutoCommit, onLanguage, text: () => container!.textContent };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  Reflect.deleteProperty(window, "desktopBridge");
});

describe("useVoiceStream", () => {
  it("shows level and a sanitized partial of its own session", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "level", level: 0.4 });
    bridge.emit({ sessionId: "s1", type: "partial", text: " open the board ", elapsedMs: 300 });
    expect(view.text()).toBe('{"level":0.4,"partial":"open the board"}');
    bridge.emit({ sessionId: "s1", type: "partial", text: "[BLANK_AUDIO]", elapsedMs: 300 });
    expect(view.text()).toBe('{"level":0.4,"partial":""}');
  });

  it("ignores events from another session or before a session exists", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "other", type: "level", level: 0.9 });
    bridge.emit({ sessionId: "other", type: "auto-commit", reason: "silence" });
    expect(view.text()).toBe('{"level":0,"partial":""}');
    expect(view.onAutoCommit).not.toHaveBeenCalled();
    const idle = mount(null);
    bridge.emit({ sessionId: "s1", type: "level", level: 0.9 });
    expect(idle.text()).toBe('{"level":0,"partial":""}');
  });

  it("hands the locked language and the commit request to the recorder", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "language", language: "de" });
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    expect(view.onLanguage).toHaveBeenCalledWith("de");
    expect(view.onAutoCommit).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the recording ends", () => {
    const bridge = installBridge();
    mount("s1");
    act(() => root!.unmount());
    root = null;
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
