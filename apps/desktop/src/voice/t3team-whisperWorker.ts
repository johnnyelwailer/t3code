// @effect-diagnostics nodeBuiltinImport:off -- Child-process entry that owns the native whisper context.
// @effect-diagnostics globalTimers:off -- Bounded wait for ggml logs, outside any Effect fiber.
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";

import { joinTokenSegments } from "./t3team-whisperWords.ts";
import {
  BACKEND_DECISION_LOG,
  GPU_BACKEND_LOG,
  VULKAN_DEVICE_LISTING_LOG,
  WHISPER_WORKER_READY,
  type WhisperWorkerRequest,
  type WhisperWorkerResponse,
} from "./t3team-whisperProtocol.ts";

/**
 * `@fugood/whisper.node` ships raw TypeScript sources that this package cannot typecheck, so the few
 * calls used here are described locally and the module is loaded with a plain `require`.
 */
type WhisperModule = {
  readonly initWhisper: (
    options: { filePath: string; useGpu: boolean; useFlashAttn: boolean },
    variant?: string,
  ) => Promise<WhisperContext>;
  readonly initWhisperVad: (
    options: { filePath: string; useGpu: boolean; nThreads: number },
    variant?: string,
  ) => Promise<WhisperVadContext>;
  readonly addNativeLogListener: (listener: (level: string, text: string) => void) => unknown;
  readonly toggleNativeLog: (enable: boolean) => Promise<void>;
};

type WhisperContext = {
  readonly transcribeData: (
    audio: ArrayBuffer,
    options: { language: string; maxLen: number; tokenTimestamps: boolean },
  ) => {
    readonly promise: Promise<{
      result: string;
      language?: string;
      segments?: ReadonlyArray<{ text: string; t0: number; t1: number }>;
    }>;
  };
};

type WhisperVadContext = {
  readonly detectSpeechData: (
    audio: ArrayBuffer,
    options: VadOptions,
  ) => Promise<ReadonlyArray<{ readonly t0: number; readonly t1: number }>>;
};

type VadOptions = {
  threshold: number;
  minSpeechDurationMs: number;
  minSilenceDurationMs: number;
  speechPadMs: number;
};

const { addNativeLogListener, initWhisper, initWhisperVad, toggleNativeLog }: WhisperModule =
  NodeModule.createRequire(__filename)("@fugood/whisper.node");

/**
 * Stricter than Silero's 0.5 default: a keyboard, a fan or a room's hum must not open a pass.
 * Segment times come back in centiseconds (measured: 13.6 s of speech ends at t1 = 1286).
 */
const VAD_OPTIONS: VadOptions = {
  threshold: 0.6,
  minSpeechDurationMs: 250,
  minSilenceDurationMs: 300,
  speechPadMs: 30,
};
const VAD_TIME_UNIT_MS = 10;
/**
 * Silero must be given a thread count: with the binding's default its detect call never returns
 * (measured on Windows with @fugood/whisper.node 1.2.0-rc.1). Silero is sequential: two threads
 * take ~0.2 s for 14 s of audio, more do not help. It runs beside whisper's GPU pass, not before.
 */
const VAD_THREADS = Math.max(1, Math.min(2, NodeOS.availableParallelism()));
/** A VAD that does not answer in time is dropped for the worker's life; whisper runs ungated. */
const VAD_TIMEOUT_MS = 3_000;
/** Under this much speech in a pass, whisper is not asked: it would only invent words. */
const MIN_SPEECH_MS = 300;

let context: WhisperContext | null = null;
let vad: WhisperVadContext | null = null;
let usingGpu = false;

process.once("disconnect", () => process.exit(0));

const reply = (response: WhisperWorkerResponse) => process.send?.(response);

/** ggml logs arrive on another thread, usually just after `initWhisper` resolves. */
const BACKEND_LOG_GRACE_MS = 1_000;

async function load(request: Extract<WhisperWorkerRequest, { type: "load" }>) {
  usingGpu = false;
  const vulkanLog: string[] = [];
  let backendReported: () => void = () => undefined;
  const backendLogged = new Promise<void>((resolve) => {
    backendReported = resolve;
  });
  addNativeLogListener((_level, text) => {
    if (VULKAN_DEVICE_LISTING_LOG.test(text)) vulkanLog.push(text);
    if (GPU_BACKEND_LOG.test(text)) usingGpu = true;
    if (BACKEND_DECISION_LOG.test(text)) backendReported();
  });
  await toggleNativeLog(true);
  const wantsGpu = request.variant !== "default";
  context = await initWhisper(
    { filePath: request.modelPath, useGpu: wantsGpu, useFlashAttn: wantsGpu },
    request.variant === "default" ? undefined : request.variant,
  );
  await Promise.race([
    backendLogged,
    new Promise((resolve) => setTimeout(resolve, BACKEND_LOG_GRACE_MS)),
  ]);
  vad = null;
  if (request.vadModelPath !== undefined) {
    // CPU on purpose: Silero is tiny, and a GPU VAD context would compete with whisper's.
    vad = await initWhisperVad({
      filePath: request.vadModelPath,
      useGpu: false,
      nThreads: VAD_THREADS,
    }).catch(() => null);
  }
  reply({
    id: request.id,
    ok: true,
    acceleration: usingGpu ? "gpu" : "cpu",
    vulkanLog,
    ...(request.vadModelPath === undefined ? {} : { vad: vad !== null }),
  });
}

async function speechMsIn(audio: ArrayBuffer): Promise<number | undefined> {
  if (!vad) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const segments = await Promise.race([
    vad.detectSpeechData(audio, VAD_OPTIONS),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), VAD_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  if (segments === null) {
    vad = null;
    return undefined;
  }
  return segments.reduce(
    (total, segment) => total + Math.max(0, segment.t1 - segment.t0) * VAD_TIME_UNIT_MS,
    0,
  );
}

async function transcribe(request: Extract<WhisperWorkerRequest, { type: "transcribe" }>) {
  if (!context) throw new Error("whisper model is not loaded");
  const pcm = Buffer.from(request.pcm16Base64, "base64");
  const audio = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
  // VAD (CPU) and whisper (GPU) run side by side so the gate adds no latency to a pass; whisper's
  // text is thrown away when VAD heard too little speech. maxLen 1 with token timestamps makes
  // every segment one token, which `joinTokenSegments` folds back into words (same text, measured).
  const [speechMs, result] = await Promise.all([
    request.vad === true ? speechMsIn(audio) : Promise.resolve(undefined),
    context.transcribeData(audio, { language: request.language, maxLen: 1, tokenTimestamps: true })
      .promise,
  ]);
  if (speechMs !== undefined && speechMs < MIN_SPEECH_MS) {
    reply({ id: request.id, ok: true, text: "", speechMs: 0 });
    return;
  }
  const words = joinTokenSegments(result.segments ?? []);
  reply({
    id: request.id,
    ok: true,
    text: result.result,
    ...(result.language ? { language: result.language } : {}),
    ...(speechMs === undefined ? {} : { speechMs: Math.round(speechMs) }),
    ...(words.length === 0 ? {} : { words }),
  });
}

process.on("message", (request: WhisperWorkerRequest) => {
  const run = request.type === "load" ? load(request) : transcribe(request);
  run.catch((error: unknown) =>
    reply({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
});

process.send?.(WHISPER_WORKER_READY);
