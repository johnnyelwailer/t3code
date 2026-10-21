// @effect-diagnostics globalTimers:off -- Plain-Node assembly outside any Effect runtime; the window hide is a one-shot delay.
import * as Electron from "electron";

import {
  makeVoiceWidgetService,
  type VoiceWidgetService,
  type VoiceWidgetWindow,
  type VoiceWidgetWindowEvent,
} from "./t3team-voiceWidgetService.ts";
import { voiceWidgetBounds, voiceWidgetUrl } from "./t3team-voiceWidgetPlacement.ts";

let service: VoiceWidgetService | null = null;

function asWidgetWindow(window: Electron.BrowserWindow): VoiceWidgetWindow {
  return {
    webContents: {
      id: window.webContents.id,
      send: (channel, payload) => window.webContents.send(channel, payload),
    },
    isDestroyed: () => window.isDestroyed(),
    isMinimized: () => window.isMinimized(),
    isFocused: () => window.isFocused(),
    isVisible: () => window.isVisible(),
    showInactive: () => window.showInactive(),
    hide: () => window.hide(),
    destroy: () => window.destroy(),
    on: (event, listener) => subscribe(window, event, listener),
  };
}

function subscribe(
  window: Electron.BrowserWindow,
  event: VoiceWidgetWindowEvent,
  listener: () => void,
): void {
  switch (event) {
    case "minimize":
      window.on("minimize", listener);
      break;
    case "restore":
      window.on("restore", listener);
      break;
    case "focus":
      window.on("focus", listener);
      break;
    case "blur":
      window.on("blur", listener);
      break;
    case "show":
      window.on("show", listener);
      break;
    case "hide":
      window.on("hide", listener);
      break;
    case "closed":
      window.on("closed", listener);
      break;
  }
}

const wrappers = new WeakMap<Electron.BrowserWindow, VoiceWidgetWindow>();

/** One wrapper per window, so the service can tell it has seen a window before. */
function wrap(window: Electron.BrowserWindow): VoiceWidgetWindow {
  const existing = wrappers.get(window);
  if (existing !== undefined) return existing;
  const created = asWidgetWindow(window);
  wrappers.set(window, created);
  return created;
}

function createWidgetWindow(input: {
  readonly applicationUrl: string;
  readonly preloadPath: string;
}): Electron.BrowserWindow {
  const window = new Electron.BrowserWindow({
    ...voiceWidgetBounds(Electron.screen.getPrimaryDisplay().workArea),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: input.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  void window.loadURL(voiceWidgetUrl(input.applicationUrl)).catch(() => undefined);
  return window;
}

export function getVoiceWidgetService(input: {
  readonly applicationUrl: string;
  readonly preloadPath: string;
}): VoiceWidgetService {
  if (service !== null) return service;
  const created = makeVoiceWidgetService({
    windowForSender: (senderId) => {
      const contents = Electron.webContents.fromId(senderId);
      const window = contents && Electron.BrowserWindow.fromWebContents(contents);
      return window ? wrap(window) : undefined;
    },
    createWidgetWindow: () => wrap(createWidgetWindow(input)),
    schedule: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  });
  Electron.app.once("will-quit", created.dispose);
  service = created;
  return created;
}
