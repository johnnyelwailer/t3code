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
import { makeVoiceLogFile, type VoiceLogFile } from "./t3team-voiceLogFile.ts";
import { makeFileVulkanDeviceMemory } from "./t3team-whisperDeviceMemory.ts";
import {
  makeWhisperHost,
  type WhisperHost,
  type WhisperWorkerHandle,
} from "./t3team-whisperHost.ts";
import { makeFileSentinel } from "./t3team-whisperSentinel.ts";
import { downloadSileroVadModel, locateSileroVadModel } from "./t3team-whisperVadModel.ts";

const WHISPER_PACKAGE = "@fugood/whisper.node";

function forkWhisperWorker(
  workerPath: string,
  extraEnv: Readonly<Record<string, string>> = {},
): WhisperWorkerHandle {
  const child = NodeChildProcess.fork(workerPath, [], {
    execPath: process.execPath,
    env: { ...process.env, ...extraEnv, ELECTRON_RUN_AS_NODE: "1" },
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

let voiceLogFile: VoiceLogFile | null = null;

/**
 * Where the voice timing lines also go: `<logDir>/voice.log`, next to the app's other logs.
 * Called once at startup; lines before it only reach the console.
 */
export function configureDesktopVoiceLog(logDir: string): void {
  voiceLogFile ??= makeVoiceLogFile({ filePath: NodePath.join(logDir, "voice.log") });
}

/** Timings, devices, model paths and counts only: never audio, never transcript text. */
const voiceLog = (message: string) => {
  const line = `[voice] ${new Date().toISOString()} ${message}`;
  console.info(line);
  voiceLogFile?.write(line);
};

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
let whisperHost: WhisperHost | null = null;
let streamService: DesktopVoiceStreamService | null = null;

export function getDesktopVoiceService(): DesktopVoiceService {
  if (service) return service;
  const voiceDir = NodePath.join(Electron.app.getPath("userData"), "voice");
  const workerPath = NodePath.join(__dirname, "voice", "t3team-whisperWorker.cjs");
  const appModelsDir = NodePath.join(voiceDir, "models");
  const vadSearchDirs = [
    appModelsDir,
    NodePath.join(Electron.app.getPath("appData"), "ActivityTracker", "models", "whisper"),
  ];
  const host = makeWhisperHost({
    spawnWorker: (env) => forkWhisperWorker(workerPath, env),
    sentinel: makeFileSentinel(NodePath.join(voiceDir, "gpu-attempts.sentinel")),
    deviceMemory: makeFileVulkanDeviceMemory(NodePath.join(voiceDir, "vulkan-device.json")),
    vadModelPath: () => locateSileroVadModel(vadSearchDirs),
    log: voiceLog,
  });
  Electron.app.once("will-quit", host.dispose);
  whisperHost = host;
  service = makeDesktopVoiceService({
    host,
    log: voiceLog,
    onDownloadProgress: broadcastModelProgress,
    vadModel: {
      locate: () => locateSileroVadModel(vadSearchDirs),
      download: () => downloadSileroVadModel({ targetDir: appModelsDir }),
    },
    isRuntimeAvailable: () => isWhisperRuntimeAvailable(workerPath),
    environment: {
      env: process.env,
      // oxlint-disable-next-line t3code/no-global-process-runtime -- Plain-Node assembly outside any Effect runtime.
      platform: process.platform,
      homeDir: Electron.app.getPath("home"),
      appDataDir: Electron.app.getPath("appData"),
      appModelsDir,
    },
  });
  return service;
}

export function getDesktopVoiceStreamService(): DesktopVoiceStreamService {
  streamService ??= makeDesktopVoiceStreamService({
    voice: getDesktopVoiceService(),
    emit: broadcastVoiceStream,
    newSessionId: () => NodeCrypto.randomUUID(),
    // Silero loads with the model: until the warm-up pass ran, audio waits for it ("pending").
    detectSpeech: async (pcm16Base64) =>
      whisperHost?.isReady() === true ? whisperHost.detectSpeech(pcm16Base64) : "pending",
    log: voiceLog,
  });
  return streamService;
}
