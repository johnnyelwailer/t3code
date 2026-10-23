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
    options: { language: string; maxThreads: number; maxLen: number; tokenTimestamps: boolean },
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
 * Silero's own defaults (threshold 0.5, 250 ms minimum speech). Measured on this app's 16 kHz tap
 * from a real desk mic: thresholds 0.35-0.6 gave the same 94-100% recall on speech mixed with the
 * room, and fan noise, white or brown noise and a steady tone all came back as 0 ms of speech. A
 * short minimum silence keeps the spans fine-grained; the session decides what a pause is.
 * Segment times come back in centiseconds (measured: 13.6 s of speech ends at t1 = 1286).
 */
const VAD_OPTIONS: VadOptions = {
  threshold: 0.5,
  minSpeechDurationMs: 250,
  minSilenceDurationMs: 100,
  speechPadMs: 30,
};
const VAD_TIME_UNIT_MS = 10;
/**
 * Silero must be given a thread count: with the binding's default its detect call never returns
 * (measured on Windows with @fugood/whisper.node 1.2.0-rc.1). It is sequential: two threads take
 * 15-100 ms per second of audio depending on load; more do not help.
 */
const VAD_THREADS = Math.max(1, Math.min(2, NodeOS.availableParallelism()));
/** A call that does not answer in time is "unknown" for that call only; the next one tries again. */
const vadTimeoutMs = (audioMs: number) => 1_000 + audioMs / 10;

let context: WhisperContext | null = null;
let vad: WhisperVadContext | null = null;
let usingGpu = false;

process.once("disconnect", () => process.exit(0));

const reply = (response: WhisperWorkerResponse) => process.send?.(response);

/** ggml logs arrive on another thread, usually just after `initWhisper` resolves. */
const BACKEND_LOG_GRACE_MS = 1_000;
const GPU_THREADS = 2;
const CPU_THREADS = 4;

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

async function detectSpeech(request: Extract<WhisperWorkerRequest, { type: "vad" }>) {
  const audio = arrayBufferOf(request.pcm16Base64);
  if (!vad) return reply({ id: request.id, ok: true, speech: null });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const segments = await Promise.race([
    vad.detectSpeechData(audio, VAD_OPTIONS),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), vadTimeoutMs(audio.byteLength / 32));
    }),
  ]).finally(() => clearTimeout(timer));
  reply({
    id: request.id,
    ok: true,
    speech:
      segments === null
        ? null
        : segments.map((segment) => ({
            startMs: segment.t0 * VAD_TIME_UNIT_MS,
            endMs: segment.t1 * VAD_TIME_UNIT_MS,
          })),
  });
}

/** Copies out of the pooled Buffer: the binding reads the whole ArrayBuffer it is given. */
function arrayBufferOf(pcm16Base64: string): ArrayBuffer {
  const pcm = Buffer.from(pcm16Base64, "base64");
  return pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
}

async function transcribe(request: Extract<WhisperWorkerRequest, { type: "transcribe" }>) {
  if (!context) throw new Error("whisper model is not loaded");
  // Greedy with whisper.cpp's defaults, as the Activity Tracker runs it: temperature 0 with 0.2
  // fallback steps, no_speech 0.6, logprob -1.0, entropy 2.4. maxLen 1 with token timestamps makes
  // every segment one token, which `joinTokenSegments` folds back into words (same text, measured).
  // Threads as the tracker sets them (2 on a GPU, 4 on CPU): the binding's default of 8 only adds
  // CPU contention under a GPU pass, which made passes slow while the machine was busy.
  const result = await context.transcribeData(arrayBufferOf(request.pcm16Base64), {
    language: request.language,
    maxThreads: usingGpu ? GPU_THREADS : CPU_THREADS,
    maxLen: 1,
    tokenTimestamps: true,
  }).promise;
  const words = joinTokenSegments(result.segments ?? []);
  reply({
    id: request.id,
    ok: true,
    text: result.result,
    ...(result.language ? { language: result.language } : {}),
    ...(words.length === 0 ? {} : { words }),
  });
}

process.on("message", (request: WhisperWorkerRequest) => {
  const run =
    request.type === "load"
      ? load(request)
      : request.type === "vad"
        ? detectSpeech(request)
        : transcribe(request);
  run.catch((error: unknown) =>
    reply({
      id: request.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
});

process.send?.(WHISPER_WORKER_READY);
