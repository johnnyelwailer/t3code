// @effect-diagnostics nodeBuiltinImport:off -- Electron/Node runtime assembly for the whisper host.
// @effect-diagnostics globalConsole:off -- Mirrors the other main-process helpers that log outside an Effect fiber.
// @effect-diagnostics globalDate:off -- Log lines carry wall-clock time so recording latency can be read from them.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

import type { DesktopVoiceModelProgress, DesktopVoiceStreamEvent } from "@t3tools/contracts";
import * as Electron from "electron";

import * as IpcChannels from "../ipc/channels.ts";
import { makeDesktopVoiceService, type DesktopVoiceService } from "./t3team-voiceService.ts";
import {
  makeDesktopVoiceStreamService,
  type DesktopVoiceStreamService,
} from "./t3team-voiceStreamService.ts";
import { makeWhisperHost, type WhisperWorkerHandle } from "./t3team-whisperHost.ts";
import { makeFileSentinel } from "./t3team-whisperSentinel.ts";

const WHISPER_PACKAGE = "@fugood/whisper.node";

function forkWhisperWorker(workerPath: string): WhisperWorkerHandle {
  const child = NodeChildProcess.fork(workerPath, [], {
    execPath: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  return {
    send: (request) => child.send(request),
    onMessage: (listener) => child.on("message", listener),
    onExit: (listener) =>
      child.on("exit", (code, signal) =>
        listener(`code=${code ?? "none"} signal=${signal ?? "none"}`),
      ),
    kill: () => child.kill(),
  };
}

function isWhisperRuntimeAvailable(workerPath: string): boolean {
  if (!NodeFS.existsSync(workerPath)) return false;
  try {
    NodeModule.createRequire(__filename).resolve(WHISPER_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

const voiceLog = (message: string) =>
  console.info(`[voice] ${new Date().toISOString()} ${message}`);

function broadcastModelProgress(progress: DesktopVoiceModelProgress): void {
  for (const window of Electron.BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(IpcChannels.VOICE_MODEL_PROGRESS_CHANNEL, progress);
  }
}

function broadcastVoiceStream(event: DesktopVoiceStreamEvent): void {
  for (const window of Electron.BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcChannels.VOICE_STREAM_CHANNEL, event);
  }
}

let service: DesktopVoiceService | null = null;
let streamService: DesktopVoiceStreamService | null = null;

export function getDesktopVoiceService(): DesktopVoiceService {
  if (service) return service;
  const voiceDir = NodePath.join(Electron.app.getPath("userData"), "voice");
  const workerPath = NodePath.join(__dirname, "voice", "t3team-whisperWorker.cjs");
  const host = makeWhisperHost({
    spawnWorker: () => forkWhisperWorker(workerPath),
    sentinel: makeFileSentinel(NodePath.join(voiceDir, "gpu-attempts.sentinel")),
    log: voiceLog,
  });
  Electron.app.once("will-quit", host.dispose);
  service = makeDesktopVoiceService({
    host,
    log: voiceLog,
    onDownloadProgress: broadcastModelProgress,
    isRuntimeAvailable: () => isWhisperRuntimeAvailable(workerPath),
    environment: {
      env: process.env,
      // oxlint-disable-next-line t3code/no-global-process-runtime -- Plain-Node assembly outside any Effect runtime.
      platform: process.platform,
      homeDir: Electron.app.getPath("home"),
      appDataDir: Electron.app.getPath("appData"),
      appModelsDir: NodePath.join(voiceDir, "models"),
    },
  });
  return service;
}

export function getDesktopVoiceStreamService(): DesktopVoiceStreamService {
  streamService ??= makeDesktopVoiceStreamService({
    voice: getDesktopVoiceService(),
    emit: broadcastVoiceStream,
    newSessionId: () => NodeCrypto.randomUUID(),
    log: voiceLog,
  });
  return streamService;
}
