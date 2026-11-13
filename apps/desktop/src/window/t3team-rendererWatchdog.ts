// @effect-diagnostics globalTimers:off -- Electron main watchdog; the timer is injectable, with setTimeout as the process-level default.
// @effect-diagnostics globalConsole:off -- The diagnostic log is injectable, with console.warn as the process-level default.
// @effect-diagnostics globalDate:off -- Timestamps are injectable, with Date.now as the process-level default.
import * as Electron from "electron";

/** IPC channel for renderer liveness, with optional render counts. */
export const RENDERER_HEARTBEAT_CHANNEL = "t3team:renderer-heartbeat";

export const HEARTBEAT_TIMEOUT_MS = 15_000;

export const RELOAD_PROMPT_TITLE = "t3team-watchdog-reload";

export type WatchdogHeartbeat = {
  readonly at?: number;
  readonly lastComponentRenderCounts?: Readonly<Record<string, number>> | null;
};

export type WatchdogDiagnostics = {
  readonly reason: "unresponsive" | "heartbeat-timeout";
  readonly unresponsiveAt: number;
  readonly lastHeartbeatAt: number | null;
  readonly lastComponentRenderCounts: Readonly<Record<string, number>> | null;
};

/** Main-process log line. */
export function formatWatchdogDiagnostics(diagnostics: WatchdogDiagnostics): string {
  const counts = diagnostics.lastComponentRenderCounts;
  const countText =
    counts && Object.keys(counts).length > 0 ? JSON.stringify(counts) : "none recorded";
  const heartbeat =
    diagnostics.lastHeartbeatAt === null
      ? "none"
      : `${diagnostics.unresponsiveAt - diagnostics.lastHeartbeatAt}ms ago`;
  return `Renderer ${diagnostics.reason}. lastHeartbeat=${heartbeat}. lastComponentRenderCounts=${countText}.`;
}

export function reloadPromptWindowOptions(
  parent?: Electron.BrowserWindow,
): Electron.BrowserWindowConstructorOptions {
  return {
    width: 440,
    height: 220,
    frame: false,
    closable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    modal: Boolean(parent),
    ...(parent ? { parent } : {}),
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  };
}

/** Frameless prompt: one Reload button, no page-level close. Escape reloads. Title signals main. */
export const RELOAD_PROMPT_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Reload</title>
<style>body{font-family:system-ui,sans-serif;margin:32px;background:#1b1b1b;color:#f3f3f3}p{line-height:1.45;margin:0 0 16px}button{padding:8px 16px;font-size:14px;cursor:pointer}</style></head>
<body><p>This window is not responding. Reload to keep working.</p>
<button id="reload" type="button" autofocus>Reload</button>
<script>function requestReload(){document.title="${RELOAD_PROMPT_TITLE}"}
document.getElementById("reload").addEventListener("click",requestReload);
document.addEventListener("keydown",function(event){if(event.key==="Escape")requestReload()});</script></body></html>`;

export function handlePromptTitle(title: string): "reload" | "ignore" {
  return title === RELOAD_PROMPT_TITLE ? "reload" : "ignore";
}

export function createRendererWatchdog(input: {
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly log: (message: string, extra?: unknown) => void;
  readonly showReloadPrompt: (diagnostics: WatchdogDiagnostics) => void;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (id: unknown) => void;
}) {
  const now = input.now ?? (() => Date.now());
  const timeoutMs = input.timeoutMs ?? HEARTBEAT_TIMEOUT_MS;
  const setTimer = input.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = input.clearTimer ?? ((id) => clearTimeout(id as NodeJS.Timeout));
  let lastHeartbeatAt: number | null = null;
  let lastComponentRenderCounts: Readonly<Record<string, number>> | null = null;
  let promptShown = false;
  let timer: unknown = null;

  const snapshot = (reason: WatchdogDiagnostics["reason"]): WatchdogDiagnostics => ({
    reason,
    unresponsiveAt: now(),
    lastHeartbeatAt,
    lastComponentRenderCounts,
  });

  const disarm = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const arm = () => {
    disarm();
    timer = setTimer(() => trigger("heartbeat-timeout"), timeoutMs);
  };

  const trigger = (reason: WatchdogDiagnostics["reason"]) => {
    if (promptShown) return;
    promptShown = true;
    disarm();
    const diagnostics = snapshot(reason);
    input.log(formatWatchdogDiagnostics(diagnostics), diagnostics);
    input.showReloadPrompt(diagnostics);
  };

  return {
    onHeartbeat(payload?: WatchdogHeartbeat) {
      lastHeartbeatAt = now();
      lastComponentRenderCounts = payload?.lastComponentRenderCounts ?? lastComponentRenderCounts;
      promptShown = false;
      arm();
    },
    onUnresponsive() {
      trigger("unresponsive");
    },
    onResponsive() {
      promptShown = false;
      if (lastHeartbeatAt !== null) arm();
    },
    dispose() {
      disarm();
    },
    getDiagnostics() {
      return snapshot("unresponsive");
    },
  };
}

export type RendererWatchdogHandle = {
  dispose: () => void;
};

/** Main-process seam. The heartbeat timeout arms only after the first heartbeat. */
export function installRendererWatchdog(
  window: Electron.BrowserWindow,
  options?: {
    readonly log?: (message: string, extra?: unknown) => void;
    readonly timeoutMs?: number;
    readonly ipcMain?: Electron.IpcMain;
    readonly BrowserWindow?: typeof Electron.BrowserWindow;
  },
): RendererWatchdogHandle {
  const ipcMain = options?.ipcMain ?? Electron.ipcMain;
  const BrowserWindow = options?.BrowserWindow ?? Electron.BrowserWindow;
  const log = options?.log ?? ((message: string, extra?: unknown) => console.warn(message, extra));
  let prompt: Electron.BrowserWindow | null = null;

  const reloadMain = () => {
    if (prompt && !prompt.isDestroyed()) prompt.destroy();
    prompt = null;
    if (!window.isDestroyed()) window.reload();
  };

  const showReloadPrompt = () => {
    if (prompt && !prompt.isDestroyed()) return;
    prompt = new BrowserWindow(reloadPromptWindowOptions(window));
    prompt.setMenuBarVisibility(false);
    prompt.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(RELOAD_PROMPT_HTML));
    prompt.webContents.on("page-title-updated", (_event, title) => {
      if (handlePromptTitle(title) === "reload") reloadMain();
    });
    prompt.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        reloadMain();
      }
    });
  };

  const watchdog = createRendererWatchdog({
    log,
    showReloadPrompt: () => showReloadPrompt(),
    ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });

  const onUnresponsive = () => watchdog.onUnresponsive();
  const onResponsive = () => watchdog.onResponsive();
  window.on("unresponsive", onUnresponsive);
  window.on("responsive", onResponsive);

  const onHeartbeat = (event: Electron.IpcMainEvent, payload: WatchdogHeartbeat) => {
    if (event.sender === window.webContents) watchdog.onHeartbeat(payload);
  };
  ipcMain.on(RENDERER_HEARTBEAT_CHANNEL, onHeartbeat);

  const dispose = () => {
    watchdog.dispose();
    window.off?.("unresponsive", onUnresponsive);
    window.off?.("responsive", onResponsive);
    ipcMain.off(RENDERER_HEARTBEAT_CHANNEL, onHeartbeat);
    if (prompt && !prompt.isDestroyed()) prompt.destroy();
  };
  window.on("closed", dispose);
  return { dispose };
}
