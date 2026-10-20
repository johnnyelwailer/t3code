// @effect-diagnostics globalTimers:off -- Idle unload runs at a child-process boundary outside Effect fibers.
import { WHISPER_WORKER_CRASH_ID } from "./t3team-whisperProtocol.ts";
import type { WhisperSentinel } from "./t3team-whisperSentinel.ts";
import {
  startWhisperWorker,
  type LiveWhisperWorker,
  type WhisperWorkerHandle,
} from "./t3team-whisperWorkerClient.ts";

export type { WhisperWorkerHandle } from "./t3team-whisperWorkerClient.ts";

const WHISPER_IDLE_UNLOAD_MS = 2 * 60 * 1000;

export type WhisperTranscription = {
  readonly text: string;
  readonly language?: string;
  readonly acceleration: "gpu" | "cpu";
};

export type WhisperHost = {
  readonly transcribe: (input: {
    readonly modelPath: string;
    readonly pcm16Base64: string;
    readonly language: string;
  }) => Promise<WhisperTranscription>;
  readonly dispose: () => void;
};

/**
 * Owns at most one whisper worker process. Policies: GPU first behind a crash sentinel with CPU
 * fallback, one CPU retry when a GPU worker dies mid-transcription, and unload (kill the process,
 * freeing GPU memory) after an idle window.
 */
export function makeWhisperHost(options: {
  readonly spawnWorker: () => WhisperWorkerHandle;
  readonly sentinel: WhisperSentinel;
  readonly idleUnloadMs?: number;
  readonly log?: (message: string) => void;
}): WhisperHost {
  const log = options.log ?? (() => undefined);
  let live: LiveWhisperWorker | null = null;
  let starting: Promise<LiveWhisperWorker> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const stopWorker = () => {
    clearTimeout(idleTimer);
    live?.handle.kill();
    live = null;
  };

  const startWorker = (modelPath: string, variant: "vulkan" | "default") =>
    startWhisperWorker({
      spawnWorker: options.spawnWorker,
      modelPath,
      variant,
      onExit: (handle) => {
        if (live?.handle === handle) live = null;
      },
    });

  const startWithPolicy = async (modelPath: string): Promise<LiveWhisperWorker> => {
    const decision = options.sentinel.evaluate();
    if (decision.blocked) {
      log(
        `GPU skipped: ${decision.crashCount} unfinished GPU attempt(s) recorded; CPU until retry`,
      );
    } else {
      options.sentinel.arm();
      try {
        return await startWorker(modelPath, "vulkan");
      } catch (error) {
        log(`GPU load failed, falling back to CPU: ${String(error)}`);
      }
    }
    return startWorker(modelPath, "default");
  };

  const ensureWorker = async (modelPath: string): Promise<LiveWhisperWorker> => {
    if (live && live.modelPath !== modelPath) stopWorker();
    if (live) return live;
    starting ??= startWithPolicy(modelPath).finally(() => (starting = null));
    live = await starting;
    log(`whisper loaded (${live.acceleration}): ${modelPath}`);
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
    };
  };

  return {
    transcribe: (input) => {
      const next = queue.then(() => run(input));
      queue = next.catch(() => undefined);
      return next;
    },
    dispose: stopWorker,
  };
}
