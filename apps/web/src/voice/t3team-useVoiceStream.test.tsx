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
  const onSessionEnd = vi.fn();
  const onLanguage = vi.fn();
  const onUtterance = vi.fn();
  const onUtteranceFailed = vi.fn();
  function Probe({ active }: { active: boolean }) {
    const view = useVoiceStream({
      active,
      sessionIdRef,
      onSessionEnd,
      onLanguage,
      onUtterance,
      onUtteranceFailed,
    });
    return <p>{JSON.stringify(view)}</p>;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<Probe active />);
  });
  return {
    onSessionEnd,
    onLanguage,
    onUtterance,
    onUtteranceFailed,
    text: () => container!.textContent,
    view: () => JSON.parse(container!.textContent ?? "{}") as Record<string, unknown>,
  };
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
    expect(view.view()).toMatchObject({ level: 0.4, partial: "open the board" });
    bridge.emit({ sessionId: "s1", type: "partial", text: "[BLANK_AUDIO]", elapsedMs: 300 });
    expect(view.view()).toMatchObject({ level: 0.4, partial: "" });
  });

  it("ignores events from another session or before a session exists", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "other", type: "level", level: 0.9 });
    bridge.emit({ sessionId: "other", type: "auto-commit", reason: "silence" });
    expect(view.view()).toMatchObject({ level: 0, writing: 0 });
    expect(view.onSessionEnd).not.toHaveBeenCalled();
    const idle = mount(null);
    bridge.emit({ sessionId: "s1", type: "level", level: 0.9 });
    expect(idle.view()).toMatchObject({ level: 0 });
  });

  it("counts a paused utterance as being written until its text arrives, and hands the text over", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "partial", text: "open the", elapsedMs: 10 });
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    expect(view.view()).toMatchObject({ partial: "", writing: 1 });
    expect(view.view().writingSinceMs).toEqual(expect.any(Number));
    expect(view.onSessionEnd).not.toHaveBeenCalled();

    bridge.emit({ sessionId: "s1", type: "utterance", text: " open the board ", elapsedMs: 900 });
    expect(view.onUtterance).toHaveBeenCalledWith("open the board");
    expect(view.view()).toMatchObject({
      writing: 0,
      writingSinceMs: null,
      heard: { text: "open the board" },
    });
  });

  it("keeps counting while several utterances are in flight", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    bridge.emit({ sessionId: "s1", type: "utterance", text: "one", elapsedMs: 1 });
    expect(view.view()).toMatchObject({ writing: 1 });
    bridge.emit({ sessionId: "s1", type: "utterance-failed", message: "worker died" });
    expect(view.view()).toMatchObject({ writing: 0, writingSinceMs: null });
    expect(view.onUtteranceFailed).toHaveBeenCalledWith("worker died");
  });

  it("drops an utterance that held no words instead of committing it", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    bridge.emit({ sessionId: "s1", type: "utterance", text: "[BLANK_AUDIO]", elapsedMs: 1 });
    expect(view.onUtterance).not.toHaveBeenCalled();
    expect(view.view()).toMatchObject({ writing: 0, heard: null });
  });

  it("ends the recording only when the main process says the session is over", () => {
    const bridge = installBridge();
    const view = mount("s1");
    bridge.emit({ sessionId: "s1", type: "language", language: "de" });
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "silence" });
    expect(view.onLanguage).toHaveBeenCalledWith("de");
    expect(view.onSessionEnd).not.toHaveBeenCalled();
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "idle" });
    bridge.emit({ sessionId: "s1", type: "auto-commit", reason: "no-speech" });
    expect(view.onSessionEnd).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes when the recording ends", () => {
    const bridge = installBridge();
    mount("s1");
    act(() => root!.unmount());
    root = null;
    expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
