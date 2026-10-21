import { describe, expect, it, vi } from "vite-plus/test";

import { makeWhisperHost, type WhisperWorkerHandle } from "./t3team-whisperHost.ts";
import type { WhisperWorkerRequest } from "./t3team-whisperProtocol.ts";
import type { WhisperSentinel } from "./t3team-whisperSentinel.ts";
import type { WhisperWorkerEnv } from "./t3team-whisperWorkerClient.ts";

type FakeBehaviour = {
  readonly onLoad?: (variant: string) => "gpu" | "cpu" | "crash";
  /** The ggml_vulkan lines a GPU load reports, given the env the worker was spawned with. */
  readonly vulkanLog?: (env: WhisperWorkerEnv | undefined) => readonly string[];
  readonly onTranscribe?: () => "ok" | "crash";
};

function makeFakeWorkers(behaviour: FakeBehaviour = {}) {
  const spawned: Array<{
    variant: string | null;
    killed: boolean;
    env: WhisperWorkerEnv | undefined;
  }> = [];
  const spawnWorker = (env?: WhisperWorkerEnv): WhisperWorkerHandle => {
    const record = { variant: null as string | null, killed: false, env };
    spawned.push(record);
    let messageListener: (message: unknown) => void = () => undefined;
    let exitListener: (detail: string) => void = () => undefined;
    queueMicrotask(() => messageListener("ready"));
    return {
      onMessage: (listener) => {
        messageListener = listener;
      },
      onExit: (listener) => {
        exitListener = listener;
      },
      kill: () => {
        record.killed = true;
      },
      send: (request: WhisperWorkerRequest) => {
        queueMicrotask(() => {
          if (request.type === "load") {
            record.variant = request.variant;
            const outcome = behaviour.onLoad?.(request.variant) ?? "gpu";
            if (outcome === "crash") return exitListener("code=3 signal=none");
            return messageListener({
              id: request.id,
              ok: true,
              acceleration: outcome,
              vulkanLog: behaviour.vulkanLog?.(env) ?? [],
            });
          }
          if (behaviour.onTranscribe?.() === "crash") return exitListener("code=3 signal=none");
          messageListener({ id: request.id, ok: true, text: "hello", language: "en" });
        });
      },
    };
  };
  return { spawned, spawnWorker };
}

function makeSentinel(blocked = false) {
  const state = { blocked, armed: 0, cleared: 0 };
  const sentinel: WhisperSentinel = {
    evaluate: () => ({
      blocked: state.blocked,
      retryAtMs: null,
      crashCount: state.blocked ? 1 : 0,
    }),
    arm: () => {
      state.armed += 1;
    },
    clear: () => {
      state.cleared += 1;
    },
  };
  return { state, sentinel };
}

const input = { modelPath: "m.bin", pcm16Base64: "AAAA", language: "en" };

describe("whisper host warm-up", () => {
  it("loads the model and settles the sentinel like a first transcription would", async () => {
    const { state, sentinel } = makeSentinel();
    const workers = makeFakeWorkers();
    const host = makeWhisperHost({ ...workers, sentinel });

    await host.warm("m.bin");
    expect(state).toMatchObject({ armed: 1, cleared: 1 });
    expect(workers.spawned).toHaveLength(1);

    await host.transcribe(input);
    expect(workers.spawned).toHaveLength(1);
  });
});

describe("whisper host policies", () => {
  it("arms the sentinel before a GPU load and clears it after the first success", async () => {
    const { state, sentinel } = makeSentinel();
    const workers = makeFakeWorkers();
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({ text: "hello", acceleration: "gpu" });
    expect(state).toMatchObject({ armed: 1, cleared: 1 });
    expect(workers.spawned.map((worker) => worker.variant)).toEqual(["vulkan"]);
    host.dispose();
  });

  it("goes straight to CPU while the sentinel blocks GPU attempts", async () => {
    const { state, sentinel } = makeSentinel(true);
    const workers = makeFakeWorkers({ onLoad: () => "cpu" });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({ acceleration: "cpu" });
    expect(state.armed).toBe(0);
    expect(workers.spawned.map((worker) => worker.variant)).toEqual(["default"]);
    host.dispose();
  });

  it("falls back to CPU when the GPU worker dies while loading", async () => {
    const { sentinel } = makeSentinel();
    const workers = makeFakeWorkers({
      onLoad: (variant) => (variant === "vulkan" ? "crash" : "cpu"),
    });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({ acceleration: "cpu" });
    expect(workers.spawned.map((worker) => worker.variant)).toEqual(["vulkan", "default"]);
    host.dispose();
  });

  it("records a mid-transcription GPU crash and retries once on CPU", async () => {
    const { state, sentinel } = makeSentinel();
    let crashed = false;
    const workers = makeFakeWorkers({
      onTranscribe: () => {
        if (crashed) return "ok";
        crashed = true;
        return "crash";
      },
      onLoad: (variant) => (variant === "vulkan" ? "gpu" : "cpu"),
    });
    const host = makeWhisperHost({
      ...workers,
      sentinel: {
        ...sentinel,
        evaluate: () => ({ blocked: state.armed >= 2, retryAtMs: null, crashCount: 0 }),
      },
    });

    expect(await host.transcribe(input)).toMatchObject({ text: "hello", acceleration: "cpu" });
    expect(state.armed).toBeGreaterThanOrEqual(2);
    expect(workers.spawned.map((worker) => worker.variant)).toEqual(["vulkan", "default"]);
    host.dispose();
  });

  it("unloads the worker after the idle window and reloads on the next use", async () => {
    vi.useFakeTimers();
    try {
      const { sentinel } = makeSentinel();
      const workers = makeFakeWorkers();
      const host = makeWhisperHost({ ...workers, sentinel, idleUnloadMs: 1_000 });

      const first = host.transcribe(input);
      await vi.advanceTimersByTimeAsync(0);
      await first;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(workers.spawned[0]?.killed).toBe(true);

      const second = host.transcribe(input);
      await vi.advanceTimersByTimeAsync(0);
      await second;
      expect(workers.spawned).toHaveLength(2);
      host.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

const INTEL = "ggml_vulkan: 0 = Intel(R) Graphics (Intel Corporation) | uma: 1 | fp16: 1";
const NVIDIA = "ggml_vulkan: 1 = NVIDIA GeForce RTX 5070 (NVIDIA) | uma: 0 | fp16: 1";
const PINNED_NVIDIA = NVIDIA.replace("1 =", "0 =");
const dualGpu = (env: WhisperWorkerEnv | undefined) =>
  env?.GGML_VK_VISIBLE_DEVICES === "1" ? [PINNED_NVIDIA] : [INTEL, NVIDIA];

describe("whisper host discrete GPU selection", () => {
  it("restarts on the discrete GPU after probing an iGPU-first machine and reports its name", async () => {
    const { sentinel } = makeSentinel();
    const workers = makeFakeWorkers({ vulkanLog: dualGpu });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({
      acceleration: "gpu",
      device: "vulkan: NVIDIA GeForce RTX 5070",
    });
    expect(workers.spawned.map((worker) => worker.env)).toEqual([
      undefined,
      { GGML_VK_VISIBLE_DEVICES: "1" },
    ]);
    expect(workers.spawned[0]?.killed).toBe(true);
    host.dispose();
  });

  it("starts pinned straight away once the device is known", async () => {
    vi.useFakeTimers();
    try {
      const { sentinel } = makeSentinel();
      const workers = makeFakeWorkers({ vulkanLog: dualGpu });
      const host = makeWhisperHost({ ...workers, sentinel, idleUnloadMs: 1_000 });

      const first = host.transcribe(input);
      await vi.advanceTimersByTimeAsync(0);
      await first;
      await vi.advanceTimersByTimeAsync(1_000);
      const second = host.transcribe(input);
      await vi.advanceTimersByTimeAsync(0);
      await second;

      expect(workers.spawned.map((worker) => worker.env?.GGML_VK_VISIBLE_DEVICES)).toEqual([
        undefined,
        "1",
        "1",
      ]);
      host.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not restart on a single-GPU machine and names the device it uses", async () => {
    const { sentinel } = makeSentinel();
    const workers = makeFakeWorkers({ vulkanLog: () => [PINNED_NVIDIA] });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({
      device: "vulkan: NVIDIA GeForce RTX 5070",
    });
    expect(workers.spawned).toHaveLength(1);
    host.dispose();
  });

  it("reports an iGPU-only machine by name rather than as a bare gpu", async () => {
    const { sentinel } = makeSentinel();
    const workers = makeFakeWorkers({ vulkanLog: () => [INTEL] });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.probeDevice("m.bin")).toEqual({
      kind: "integrated",
      label: "vulkan: Intel(R) Graphics",
    });
    expect(workers.spawned).toHaveLength(1);
    host.dispose();
  });

  it("reports cpu when no GPU is available", async () => {
    const { sentinel } = makeSentinel(true);
    const workers = makeFakeWorkers({ onLoad: () => "cpu" });
    const host = makeWhisperHost({ ...workers, sentinel });

    expect(await host.transcribe(input)).toMatchObject({ acceleration: "cpu", device: "cpu" });
    expect(await host.probeDevice("m.bin")).toEqual({ kind: "cpu", label: "cpu" });
    host.dispose();
  });
});
