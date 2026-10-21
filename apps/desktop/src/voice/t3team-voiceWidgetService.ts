import {
  VOICE_WIDGET_EXIT_MS,
  type DesktopVoiceWidgetCommand,
  type DesktopVoiceWidgetSnapshot,
} from "@t3tools/contracts";

import * as IpcChannels from "../ipc/channels.ts";

export interface VoiceWidgetContents {
  readonly id: number;
  readonly send: (channel: string, payload: unknown) => void;
}

/** The slice of an Electron BrowserWindow the widget service uses, so tests can fake it. */
export interface VoiceWidgetWindow {
  readonly webContents: VoiceWidgetContents;
  readonly isDestroyed: () => boolean;
  readonly isMinimized: () => boolean;
  readonly isFocused: () => boolean;
  readonly isVisible: () => boolean;
  readonly showInactive: () => void;
  readonly hide: () => void;
  readonly destroy: () => void;
  readonly on: (event: VoiceWidgetWindowEvent, listener: () => void) => void;
}

const OWNER_EVENTS = ["minimize", "restore", "focus", "blur", "show", "hide"] as const;
export type VoiceWidgetWindowEvent = (typeof OWNER_EVENTS)[number] | "closed";

export interface VoiceWidgetService {
  readonly publish: (senderId: number, snapshot: DesktopVoiceWidgetSnapshot) => void;
  readonly command: (senderId: number, command: DesktopVoiceWidgetCommand) => void;
  readonly dispose: () => void;
}

/** Leaves the page a beat past its exit animation before the window disappears under it. */
const HIDE_AFTER_MS = VOICE_WIDGET_EXIT_MS + 80;

/**
 * A floating voice widget in a window of its own, shown while the main window (the one that
 * publishes snapshots) is minimized, hidden or unfocused and a recording is live or just
 * committed. The window is created hidden as soon as there is a main window to serve and is only
 * shown once its page has said it is ready, so Electron's empty window and loading view are never
 * on screen. The page animates itself in and out; the window is hidden after the exit animation
 * and destroyed only when the main window closes.
 */
export function makeVoiceWidgetService(deps: {
  readonly windowForSender: (senderId: number) => VoiceWidgetWindow | undefined;
  readonly createWidgetWindow: () => VoiceWidgetWindow;
  /** Runs `run` after `ms`; the returned function cancels it. */
  readonly schedule: (run: () => void, ms: number) => () => void;
}): VoiceWidgetService {
  const { schedule } = deps;
  let owner: VoiceWidgetWindow | undefined;
  let widget: VoiceWidgetWindow | undefined;
  let widgetReady = false;
  let widgetShown = false;
  let latest: DesktopVoiceWidgetSnapshot | undefined;
  let cancelHide: (() => void) | undefined;
  const observed = new WeakSet<VoiceWidgetWindow>();

  const isBackground = (window: VoiceWidgetWindow) =>
    window.isMinimized() || !window.isFocused() || !window.isVisible();

  const isWanted = () =>
    owner !== undefined &&
    !owner.isDestroyed() &&
    latest !== undefined &&
    latest.state !== "idle" &&
    isBackground(owner);

  const liveWidget = () => (widget !== undefined && !widget.isDestroyed() ? widget : undefined);

  const sendSnapshot = () => {
    const target = liveWidget();
    if (target === undefined || !widgetReady || latest === undefined) return;
    const shown = isWanted() ? latest : { ...latest, state: "idle" as const };
    target.webContents.send(IpcChannels.VOICE_WIDGET_SNAPSHOT_CHANNEL, shown);
  };

  const ensureWidget = () => {
    if (liveWidget() !== undefined) return;
    const created = deps.createWidgetWindow();
    widget = created;
    widgetReady = false;
    widgetShown = false;
    created.on("closed", () => {
      if (widget !== created) return;
      widget = undefined;
      widgetReady = false;
      widgetShown = false;
    });
  };

  const hideAfterExit = () => {
    cancelHide?.();
    cancelHide = schedule(() => {
      cancelHide = undefined;
      const target = liveWidget();
      if (target === undefined || isWanted()) return;
      target.hide();
      widgetShown = false;
    }, HIDE_AFTER_MS);
  };

  const evaluate = () => {
    if (owner === undefined || owner.isDestroyed()) return;
    ensureWidget();
    const target = liveWidget();
    if (target === undefined || !widgetReady) return;
    if (isWanted()) {
      cancelHide?.();
      cancelHide = undefined;
      if (!widgetShown) {
        target.showInactive();
        widgetShown = true;
      }
      sendSnapshot();
      return;
    }
    if (!widgetShown) return;
    sendSnapshot();
    hideAfterExit();
  };

  const observe = (window: VoiceWidgetWindow) => {
    if (observed.has(window)) return;
    observed.add(window);
    for (const event of OWNER_EVENTS) window.on(event, evaluate);
    window.on("closed", () => {
      if (owner === window) owner = undefined;
      cancelHide?.();
      const target = liveWidget();
      widget = undefined;
      if (target !== undefined) target.destroy();
    });
  };

  return {
    publish: (senderId, snapshot) => {
      const window = deps.windowForSender(senderId);
      if (window === undefined) return;
      owner = window;
      latest = snapshot;
      observe(window);
      evaluate();
    },
    command: (senderId, command) => {
      const target = liveWidget();
      if (target === undefined || target.webContents.id !== senderId) return;
      if (command === "ready") {
        widgetReady = true;
        evaluate();
        return;
      }
      if (owner !== undefined && !owner.isDestroyed()) {
        owner.webContents.send(IpcChannels.VOICE_WIDGET_COMMAND_CHANNEL, command);
      }
    },
    dispose: () => {
      cancelHide?.();
      const target = liveWidget();
      widget = undefined;
      if (target !== undefined) target.destroy();
    },
  };
}
