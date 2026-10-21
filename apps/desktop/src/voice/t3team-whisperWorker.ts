// @effect-diagnostics nodeBuiltinImport:off -- Child-process entry that owns the native whisper context.
// @effect-diagnostics globalTimers:off -- Bounded wait for ggml logs, outside any Effect fiber.
import * as NodeModule from "node:module";

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
  readonly addNativeLogListener: (listener: (level: string, text: string) => void) => unknown;
  readonly toggleNativeLog: (enable: boolean) => Promise<void>;
};

type WhisperContext = {
  readonly transcribeData: (
    audio: ArrayBuffer,
    options: { language: string },
  ) => { readonly promise: Promise<{ result: string; language?: string }> };
};

const { addNativeLogListener, initWhisper, toggleNativeLog }: WhisperModule =
  NodeModule.createRequire(__filename)("@fugood/whisper.node");

let context: WhisperContext | null = null;
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
  reply({ id: request.id, ok: true, acceleration: usingGpu ? "gpu" : "cpu", vulkanLog });
}

async function transcribe(request: Extract<WhisperWorkerRequest, { type: "transcribe" }>) {
  if (!context) throw new Error("whisper model is not loaded");
  const pcm = Buffer.from(request.pcm16Base64, "base64");
  const audio = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
  const result = await context.transcribeData(audio, { language: request.language }).promise;
  reply({
    id: request.id,
    ok: true,
    text: result.result,
    ...(result.language ? { language: result.language } : {}),
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
