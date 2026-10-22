// @effect-diagnostics globalTimers:off -- Idle unload runs at a child-process boundary outside Effect fibers.
import { WHISPER_WORKER_CRASH_ID } from "./t3team-whisperProtocol.ts";
import type { WhisperSentinel } from "./t3team-whisperSentinel.ts";
import {
  describeWhisperDevice,
  parseVulkanDevices,
  type WhisperDeviceReport,
} from "./t3team-whisperVulkanDevices.ts";
import { makeWhisperWorkerStarter } from "./t3team-whisperWorkerStarter.ts";
import {
  type LiveWhisperWorker,
  type WhisperWorkerEnv,
  type WhisperWorkerHandle,
} from "./t3team-whisperWorkerClient.ts";

export type { WhisperWorkerHandle } from "./t3team-whisperWorkerClient.ts";

const WHISPER_IDLE_UNLOAD_MS = 2 * 60 * 1000;
/** One second of silence; a real pass settles the GPU crash sentinel, which a bare model load would leave armed. */
const WARMUP_PCM_BASE64 = Buffer.alloc(16_000 * 2).toString("base64");

export type WhisperTranscription = {
  readonly text: string;
  readonly language?: string;
  readonly acceleration: "gpu" | "cpu";
  /** The device that actually ran the pass, e.g. `vulkan: NVIDIA GeForce RTX 5070` or `cpu`. */
  readonly device: string;
};

export type WhisperHost = {
  readonly transcribe: (input: {
    readonly modelPath: string;
    readonly pcm16Base64: string;
    readonly language: string;
  }) => Promise<WhisperTranscription>;
  /** Loads the model with a throwaway transcription, so a recording's first partial is not a cold start. */
  readonly warm: (modelPath: string) => Promise<void>;
  /** Loads `modelPath` if needed and reports the device it runs on; GPU verdicts are remembered. */
  readonly probeDevice: (modelPath: string) => Promise<WhisperDeviceReport>;
  readonly dispose: () => void;
};

/**
 * Owns at most one whisper worker process. Policies: GPU first behind a crash sentinel with CPU
 * fallback, one CPU retry when a GPU worker dies mid-transcription, and unload (kill the process,
 * freeing GPU memory) after an idle window.
 */
export function makeWhisperHost(options: {
  readonly spawnWorker: (env?: WhisperWorkerEnv) => WhisperWorkerHandle;
  readonly sentinel: WhisperSentinel;
  readonly idleUnloadMs?: number;
  readonly log?: (message: string) => void;
}): WhisperHost {
  const log = options.log ?? (() => undefined);
  let live: LiveWhisperWorker | null = null;
  let starting: Promise<LiveWhisperWorker> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let knownGpu: WhisperDeviceReport | undefined;

  const deviceOf = (worker: LiveWhisperWorker) =>
    describeWhisperDevice(worker.acceleration, parseVulkanDevices(worker.vulkanLog));

  const stopWorker = () => {
    clearTimeout(idleTimer);
    live?.handle.kill();
    live = null;
  };

  const startWithPolicy = makeWhisperWorkerStarter({
    spawnWorker: options.spawnWorker,
    sentinel: options.sentinel,
    log,
    onExit: (handle) => {
      if (live?.handle === handle) live = null;
    },
  });

  const ensureWorker = async (modelPath: string): Promise<LiveWhisperWorker> => {
    if (live && live.modelPath !== modelPath) stopWorker();
    if (live) return live;
    starting ??= startWithPolicy(modelPath).finally(() => (starting = null));
    live = await starting;
    const device = deviceOf(live);
    if (live.acceleration === "gpu") knownGpu = device;
    log(`whisper loaded (${device.label}): ${modelPath}`);
    return live;
  };

  const scheduleIdleUnload = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      log("whisper idle: unloading model");
      stopWorker();
    }, options.idleUnloadMs ?? WHISPER_IDLE_UNLOAD_MS);
    idleTimer.unref?.();
  };

  const run = async (
    input: Parameters<WhisperHost["transcribe"]>[0],
    retriedOnCpu = false,
  ): Promise<WhisperTranscription> => {
    const worker = await ensureWorker(input.modelPath);
    const response = await worker.call({
      type: "transcribe",
      pcm16Base64: input.pcm16Base64,
      language: input.language,
    });
    if (!response.ok) {
      stopWorker();
      if (response.id === WHISPER_WORKER_CRASH_ID && worker.acceleration === "gpu") {
        options.sentinel.arm();
        if (!retriedOnCpu) return run(input, true);
      }
      throw new Error(response.message);
    }
    if (!("text" in response)) throw new Error("whisper worker returned an unexpected reply");
    if (worker.acceleration === "gpu") options.sentinel.clear();
    scheduleIdleUnload();
    return {
      text: response.text,
      ...(response.language ? { language: response.language } : {}),
      acceleration: worker.acceleration,
      device: deviceOf(worker).label,
    };
  };

  return {
    transcribe: (input) => {
      const next = queue.then(() => run(input));
      queue = next.catch(() => undefined);
      return next;
    },
    warm: (modelPath) => {
      const next = queue.then(() =>
        run({ modelPath, pcm16Base64: WARMUP_PCM_BASE64, language: "en" }),
      );
      queue = next.catch(() => undefined);
      return next.then(() => undefined);
    },
    probeDevice: (modelPath) => {
      if (knownGpu) return Promise.resolve(knownGpu);
      const next = queue.then(async () => deviceOf(await ensureWorker(modelPath)));
      queue = next.catch(() => undefined);
      return next;
    },
    dispose: stopWorker,
  };
}
