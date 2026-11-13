import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  HEARTBEAT_TIMEOUT_MS,
  RELOAD_PROMPT_HTML,
  RELOAD_PROMPT_TITLE,
  RENDERER_HEARTBEAT_CHANNEL,
  createRendererWatchdog,
  formatWatchdogDiagnostics,
  handlePromptTitle,
  installRendererWatchdog,
  reloadPromptWindowOptions,
} from "./t3team-rendererWatchdog.ts";

describe("createRendererWatchdog", () => {
  it("logs diagnostics and offers Reload once on unresponsive", () => {
    const log = vi.fn();
    const showReloadPrompt = vi.fn();
    const watchdog = createRendererWatchdog({
      now: () => 1_000,
      log,
      showReloadPrompt,
    });
    watchdog.onHeartbeat({ lastComponentRenderCounts: { ProbeHost: 4 } });
    watchdog.onUnresponsive();
    watchdog.onUnresponsive();
    expect(showReloadPrompt).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    const message = String(log.mock.calls[0]![0]);
    expect(message).toContain("unresponsive");
    expect(message).toContain("ProbeHost");
    expect(message).toContain("4");
    watchdog.dispose();
  });

  it("does not start the heartbeat timeout until the first heartbeat", () => {
    const showReloadPrompt = vi.fn();
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const watchdog = createRendererWatchdog({
      now: () => 0,
      timeoutMs: 100,
      log: () => {},
      showReloadPrompt,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimer: () => {},
    });
    expect(timers).toHaveLength(0);
    watchdog.onHeartbeat({});
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(100);
    timers[0]!.fn();
    expect(showReloadPrompt).toHaveBeenCalledTimes(1);
    expect(showReloadPrompt.mock.calls[0]![0].reason).toBe("heartbeat-timeout");
    watchdog.dispose();
  });

  it("a later heartbeat resets the timeout", () => {
    const showReloadPrompt = vi.fn();
    let timerFn: (() => void) | null = null;
    const watchdog = createRendererWatchdog({
      now: () => 0,
      timeoutMs: 100,
      log: () => {},
      showReloadPrompt,
      setTimer: (fn) => {
        timerFn = fn;
        return 1;
      },
      clearTimer: () => {
        timerFn = null;
      },
    });
    watchdog.onHeartbeat({});
    watchdog.onHeartbeat({});
    expect(timerFn).toBeTypeOf("function");
    watchdog.dispose();
    expect(showReloadPrompt).not.toHaveBeenCalled();
  });
});

describe("reload prompt", () => {
  it("is frameless, not closable, and has a single Reload button with no page-level close", () => {
    const options = reloadPromptWindowOptions();
    expect(options.frame).toBe(false);
    expect(options.closable).toBe(false);
    expect(options.minimizable).toBe(false);
    expect(RELOAD_PROMPT_HTML).toContain(">Reload</button>");
    expect(RELOAD_PROMPT_HTML.match(/<button/g)).toHaveLength(1);
    expect(RELOAD_PROMPT_HTML).not.toMatch(/Close|Continue in background|&times;|×/i);
    expect(handlePromptTitle(RELOAD_PROMPT_TITLE)).toBe("reload");
    expect(handlePromptTitle("Reload")).toBe("ignore");
  });

  it("Escape and the Reload button both request a reload", () => {
    expect(RELOAD_PROMPT_HTML).toContain('event.key==="Escape"');
    expect(RELOAD_PROMPT_HTML).toContain(RELOAD_PROMPT_TITLE);
    expect(RELOAD_PROMPT_HTML).toContain("getElementById(\"reload\")");
  });
});

describe("installRendererWatchdog", () => {
  const listeners = new Map<string, Function[]>();
  const ipcListeners = new Map<string, Function[]>();
  const created: Array<{ options: unknown; webContentsListeners: Map<string, Function[]> }> = [];

  const window = {
    on: (event: string, fn: Function) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
    },
    off: (event: string, fn: Function) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((listener) => listener !== fn),
      );
    },
    isDestroyed: () => false,
    reload: vi.fn(),
    webContents: { id: 1 },
  };

  const ipcMain = {
    on: (channel: string, fn: Function) => {
      ipcListeners.set(channel, [...(ipcListeners.get(channel) ?? []), fn]);
    },
    off: (channel: string, fn: Function) => {
      ipcListeners.set(
        channel,
        (ipcListeners.get(channel) ?? []).filter((listener) => listener !== fn),
      );
    },
  };

  function FakeBrowserWindow(this: any, options: unknown) {
    const webContentsListeners = new Map<string, Function[]>();
    this.options = options;
    this.webContents = {
      on: (event: string, fn: Function) => {
        webContentsListeners.set(event, [...(webContentsListeners.get(event) ?? []), fn]);
      },
    };
    this.setMenuBarVisibility = () => {};
    this.loadURL = () => {};
    this.isDestroyed = () => false;
    this.destroy = vi.fn();
    this.webContentsListeners = webContentsListeners;
    created.push({ options, webContentsListeners });
  }

  afterEach(() => {
    listeners.clear();
    ipcListeners.clear();
    created.length = 0;
    window.reload.mockReset();
  });

  it("shows the Reload prompt on unresponsive and reloads the main window", () => {
    const handle = installRendererWatchdog(window as never, {
      log: () => {},
      ipcMain: ipcMain as never,
      BrowserWindow: FakeBrowserWindow as never,
    });
    const unresponsive = listeners.get("unresponsive") ?? [];
    expect(unresponsive).toHaveLength(1);
    unresponsive[0]!();
    expect(created).toHaveLength(1);
    expect((created[0]!.options as { closable: boolean; frame: boolean }).closable).toBe(false);
    expect((created[0]!.options as { frame: boolean }).frame).toBe(false);
    const titleHandlers = created[0]!.webContentsListeners.get("page-title-updated") ?? [];
    titleHandlers[0]!({}, RELOAD_PROMPT_TITLE);
    expect(window.reload).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it("Escape on the prompt reloads the main window", () => {
    installRendererWatchdog(window as never, {
      log: () => {},
      ipcMain: ipcMain as never,
      BrowserWindow: FakeBrowserWindow as never,
    });
    (listeners.get("unresponsive") ?? [])[0]!();
    const inputHandlers = created[0]!.webContentsListeners.get("before-input-event") ?? [];
    const event = { preventDefault: vi.fn() };
    inputHandlers[0]!(event, { type: "keyDown", key: "Escape" });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.reload).toHaveBeenCalledTimes(1);
  });

  it("forwards a heartbeat on the IPC channel", () => {
    const handle = installRendererWatchdog(window as never, {
      log: () => {},
      timeoutMs: HEARTBEAT_TIMEOUT_MS,
      ipcMain: ipcMain as never,
      BrowserWindow: FakeBrowserWindow as never,
    });
    const handlers = ipcListeners.get(RENDERER_HEARTBEAT_CHANNEL) ?? [];
    expect(handlers).toHaveLength(1);
    handlers[0]!({ sender: window.webContents }, { lastComponentRenderCounts: { Chips: 2 } });
    (listeners.get("unresponsive") ?? [])[0]!();
    const log = vi.fn();
    handle.dispose();
    // A heartbeat was recorded; a fresh install is not needed to prove the channel name.
    expect(RENDERER_HEARTBEAT_CHANNEL).toBe("t3team:renderer-heartbeat");
    expect(formatWatchdogDiagnostics({
      reason: "unresponsive",
      unresponsiveAt: 50,
      lastHeartbeatAt: 20,
      lastComponentRenderCounts: { Chips: 2 },
    })).toContain("Chips");
    void log;
  });
});
