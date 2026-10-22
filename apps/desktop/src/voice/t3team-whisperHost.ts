// @effect-diagnostics globalTimers:off -- Idle unload runs at a child-process boundary outside Effect fibers.
// @effect-diagnostics globalDate:off -- Load and pass timings are measured around child-process calls.
import type { VulkanDeviceMemory } from "./t3team-whisperDeviceMemory.ts";
import { WHISPER_WORKER_CRASH_ID, type WhisperWord } from "./t3team-whisperProtocol.ts";
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

/**
 * Unload policy by device. A discrete GPU keeps the model resident: base needs a few hundred MB of
 * its own VRAM, and every reload costs a spawn plus a model load right when someone starts talking.
 * An iGPU or the CPU shares system memory with everything else, so the model goes after a while.
 */
const WHISPER_IDLE_UNLOAD_MS = 10 * 60 * 1000;
const WHISPER_DISCRETE_IDLE_UNLOAD_MS: number | null = null;
/** One second of silence; a real pass settles the GPU crash sentinel, which a bare model load would leave armed. */
const WARMUP_PCM_BASE64 = Buffer.alloc(16_000 * 2).toString("base64");

export type WhisperTranscription = {
  readonly text: string;
  readonly language?: string;
  readonly acceleration: "gpu" | "cpu";
  /** The device that actually ran the pass, e.g. `vulkan: NVIDIA GeForce RTX 5070` or `cpu`. */
  readonly device: string;
  /** Time the worker spent on this pass alone: no queueing behind other passes, no model load. */
  readonly passMs: number;
  /** Speech VAD heard in the audio; absent when VAD did not run. 0 means whisper was skipped. */
  readonly speechMs?: number;
  readonly words?: readonly WhisperWord[];
};

export type WhisperHost = {
  readonly transcribe: (input: {
    readonly modelPath: string;
    readonly pcm16Base64: string;
    readonly language: string;
    /** Gate the pass with VAD (when the worker has it): no speech means no whisper call. */
    readonly vad?: boolean;
  }) => Promise<WhisperTranscription>;
  /**
   * Loads the model and runs one throwaway pass on it, so the GPU's shader compile and the first
   * allocation happen now rather than on the first words. `onLoaded` fires between the two steps.
   * A worker that is already loaded and has run a pass makes this a no-op.
   */
  readonly warm: (modelPath: string, onLoaded?: () => void) => Promise<void>;
  /** Loads `modelPath` if needed and reports the device it runs on; GPU verdicts are remembered. */
  readonly probeDevice: (modelPath: string) => Promise<WhisperDeviceReport>;
  /** True once a loaded worker finished a pass, i.e. the next pass will not pay for a cold start. */
  readonly isReady: () => boolean;
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
  /** Idle window for an iGPU or CPU worker. */
  readonly idleUnloadMs?: number;
  /** Idle window for a worker on a discrete GPU; `null` keeps it loaded until the app quits. */
  readonly discreteIdleUnloadMs?: number | null;
  /** Carries the chosen Vulkan device across app restarts. */
  readonly deviceMemory?: VulkanDeviceMemory;
  readonly vadModelPath?: () => string | null;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
}): WhisperHost {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  let live: LiveWhisperWorker | null = null;
  let starting: Promise<LiveWhisperWorker> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let knownGpu: WhisperDeviceReport | undefined;
  let passedOn: LiveWhisperWorker | null = null;

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
    ...(options.deviceMemory ? { deviceMemory: options.deviceMemory } : {}),
    ...(options.vadModelPath ? { vadModelPath: options.vadModelPath } : {}),
  });

  const ensureWorker = async (modelPath: string): Promise<LiveWhisperWorker> => {
    if (live && live.modelPath !== modelPath) stopWorker();
    if (live) return live;
    const startedAt = now();
    starting ??= startWithPolicy(modelPath).finally(() => (starting = null));
    live = await starting;
    const device = deviceOf(live);
    if (live.acceleration === "gpu") knownGpu = device;
    log(
      `whisper loaded (${device.label}${live.vad ? ", silero vad" : ", no vad"}) in ${now() - startedAt} ms: ${modelPath}`,
    );
    return live;
  };

  const idleWindowFor = (worker: LiveWhisperWorker): number | null =>
    deviceOf(worker).kind === "discrete"
      ? options.discreteIdleUnloadMs === undefined
        ? WHISPER_DISCRETE_IDLE_UNLOAD_MS
        : options.discreteIdleUnloadMs
      : (options.idleUnloadMs ?? WHISPER_IDLE_UNLOAD_MS);

  const scheduleIdleUnload = (worker: LiveWhisperWorker) => {
    clearTimeout(idleTimer);
    const windowMs = idleWindowFor(worker);
    if (windowMs === null) return;
    idleTimer = setTimeout(() => {
      log("whisper idle: unloading model");
      stopWorker();
    }, windowMs);
    idleTimer.unref?.();
  };

  const run = async (
    input: Parameters<WhisperHost["transcribe"]>[0],
    retriedOnCpu = false,
  ): Promise<WhisperTranscription> => {
    const worker = await ensureWorker(input.modelPath);
    const passStartedAt = now();
    const response = await worker.call({
      type: "transcribe",
      pcm16Base64: input.pcm16Base64,
      language: input.language,
      ...(input.vad === true && worker.vad ? { vad: true } : {}),
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
    const passMs = now() - passStartedAt;
    if (worker.acceleration === "gpu") options.sentinel.clear();
    passedOn = worker;
    scheduleIdleUnload(worker);
    return {
      text: response.text,
      ...(response.language ? { language: response.language } : {}),
      acceleration: worker.acceleration,
      device: deviceOf(worker).label,
      passMs,
      ...(response.speechMs === undefined ? {} : { speechMs: response.speechMs }),
      ...(response.words === undefined ? {} : { words: response.words }),
    };
  };

  return {
    transcribe: (input) => {
      const next = queue.then(() => run(input));
      queue = next.catch(() => undefined);
      return next;
    },
    warm: (modelPath, onLoaded) => {
      if (live?.modelPath === modelPath && passedOn === live) return Promise.resolve();
      const next = queue.then(async () => {
        await ensureWorker(modelPath);
        onLoaded?.();
        const result = await run({ modelPath, pcm16Base64: WARMUP_PCM_BASE64, language: "en" });
        log(`whisper warm-up pass: ${result.passMs} ms (${result.device})`);
      });
      queue = next.catch(() => undefined);
      return next;
    },
    probeDevice: (modelPath) => {
      if (knownGpu) return Promise.resolve(knownGpu);
      const next = queue.then(async () => deviceOf(await ensureWorker(modelPath)));
      queue = next.catch(() => undefined);
      return next;
    },
    isReady: () => live !== null && passedOn === live && starting === null,
    dispose: stopWorker,
  };
}
