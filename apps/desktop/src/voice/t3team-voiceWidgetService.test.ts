import type { DesktopVoiceWidgetSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeVoiceWidgetService, type VoiceWidgetWindow } from "./t3team-voiceWidgetService.ts";

type Sent = { readonly channel: string; readonly payload: unknown };

function fakeWindow(id: number) {
  const listeners = new Map<string, Array<() => void>>();
  const sent: Sent[] = [];
  const state = {
    minimized: false,
    focused: true,
    visible: true,
    destroyed: false,
    shown: 0,
    hidden: 0,
  };
  const window: VoiceWidgetWindow = {
    webContents: { id, send: (channel, payload) => sent.push({ channel, payload }) },
    isDestroyed: () => state.destroyed,
    isMinimized: () => state.minimized,
    isFocused: () => state.focused,
    isVisible: () => state.visible,
    showInactive: () => void (state.shown += 1),
    hide: () => void (state.hidden += 1),
    destroy: () => void (state.destroyed = true),
    on: (event, listener) => listeners.set(event, [...(listeners.get(event) ?? []), listener]),
  };
  const emit = (event: string) => listeners.get(event)?.forEach((listener) => listener());
  return { window, state, sent, emit };
}

const snapshot = (state: DesktopVoiceWidgetSnapshot["state"]): DesktopVoiceWidgetSnapshot => ({
  state,
  sessionId: "s1",
  startedAtMs: 1,
  endedAtMs: null,
  heardText: null,
  hotkeyLabel: null,
});

function setup() {
  const owner = fakeWindow(1);
  const widgets: ReturnType<typeof fakeWindow>[] = [];
  const timers: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  const service = makeVoiceWidgetService({
    windowForSender: (id) => (id === 1 ? owner.window : undefined),
    createWidgetWindow: () => {
      const widget = fakeWindow(100 + widgets.length);
      widgets.push(widget);
      return widget.window;
    },
    schedule: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => void (timer.cancelled = true);
    },
  });
  const widgetId = () => widgets.at(-1)!.window.webContents.id;
  const fireTimers = () =>
    timers.splice(0).forEach((timer) => (timer.cancelled ? undefined : timer.run()));
  return { owner, widgets, service, widgetId, fireTimers };
}

const stateOf = (payload: unknown) =>
  typeof payload === "object" && payload !== null && "state" in payload ? payload.state : null;

const snapshotsSent = (widget: ReturnType<typeof fakeWindow>) =>
  widget.sent
    .filter((message) => message.channel === "desktop:voice-widget-snapshot")
    .map((message) => stateOf(message.payload));

describe("voice widget service", () => {
  it("prepares a hidden widget as soon as the main window publishes, and shows nothing yet", () => {
    const { widgets, service } = setup();
    service.publish(1, snapshot("idle"));
    expect(widgets).toHaveLength(1);
    expect(widgets[0]!.state.shown).toBe(0);
  });

  it("stays hidden while the app is focused", () => {
    const { widgets, service, widgetId } = setup();
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    expect(widgets[0]!.state.shown).toBe(0);
  });

  it("never shows a widget whose page has not said it is ready", () => {
    const { owner, widgets, service, widgetId } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    expect(widgets[0]!.state.shown).toBe(0);
    service.command(widgetId(), "ready");
    expect(widgets[0]!.state.shown).toBe(1);
    expect(snapshotsSent(widgets[0]!)).toEqual(["recording"]);
  });

  it("shows when the app is minimized and the page is ready", () => {
    const { owner, widgets, service, widgetId } = setup();
    service.publish(1, snapshot("idle"));
    service.command(widgetId(), "ready");
    owner.state.minimized = true;
    service.publish(1, snapshot("recording"));
    expect(widgets[0]!.state.shown).toBe(1);
  });

  it("appears when the app loses focus mid-recording", () => {
    const { owner, widgets, service, widgetId } = setup();
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    owner.state.focused = false;
    owner.emit("blur");
    expect(widgets[0]!.state.shown).toBe(1);
  });

  it("tells the page to animate out, then hides the window after the exit animation", () => {
    const { owner, widgets, service, widgetId, fireTimers } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    service.publish(1, snapshot("idle"));
    expect(snapshotsSent(widgets[0]!)).toEqual(["recording", "idle"]);
    expect(widgets[0]!.state.hidden).toBe(0);
    fireTimers();
    expect(widgets[0]!.state.hidden).toBe(1);
    expect(widgets[0]!.state.destroyed).toBe(false);
  });

  it("slides out when the app regains focus mid-recording", () => {
    const { owner, widgets, service, widgetId, fireTimers } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    owner.state.focused = true;
    owner.emit("focus");
    expect(snapshotsSent(widgets[0]!).at(-1)).toBe("idle");
    fireTimers();
    expect(widgets[0]!.state.hidden).toBe(1);
  });

  it("keeps the window when a new recording starts before the exit finished", () => {
    const { owner, widgets, service, widgetId, fireTimers } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    service.publish(1, snapshot("idle"));
    service.publish(1, snapshot("recording"));
    fireTimers();
    expect(widgets[0]!.state.hidden).toBe(0);
    expect(widgets[0]!.state.shown).toBe(1);
    expect(snapshotsSent(widgets[0]!).at(-1)).toBe("recording");
  });

  it("reuses one widget window across recordings", () => {
    const { owner, widgets, service, widgetId, fireTimers } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    service.publish(1, snapshot("idle"));
    fireTimers();
    service.publish(1, snapshot("recording"));
    expect(widgets).toHaveLength(1);
    expect(widgets[0]!.state.shown).toBe(2);
  });

  it("resends the snapshot on ready and forwards stop to the owner", () => {
    const { owner, widgets, service, widgetId } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(widgetId(), "ready");
    const before = widgets[0]!.sent.length;
    service.command(widgetId(), "ready");
    expect(widgets[0]!.sent.length).toBe(before + 1);
    service.command(widgetId(), "stop");
    expect(owner.sent.at(-1)).toEqual({ channel: "desktop:voice-widget-command", payload: "stop" });
  });

  it("ignores commands from any window but the widget", () => {
    const { owner, service } = setup();
    owner.state.focused = false;
    service.publish(1, snapshot("recording"));
    service.command(1, "stop");
    expect(owner.sent).toHaveLength(0);
  });

  it("destroys the widget when the owner closes", () => {
    const { widgets, owner, service } = setup();
    service.publish(1, snapshot("idle"));
    owner.emit("closed");
    expect(widgets[0]!.state.destroyed).toBe(true);
  });

  it("ignores publishes from a sender that has no window", () => {
    const { widgets, service } = setup();
    service.publish(7, snapshot("recording"));
    expect(widgets).toHaveLength(0);
  });
});
