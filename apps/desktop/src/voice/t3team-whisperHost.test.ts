import { describe, expect, it, vi } from "vite-plus/test";

import { makeWhisperHost, type WhisperWorkerHandle } from "./t3team-whisperHost.ts";
import type { WhisperWorkerRequest } from "./t3team-whisperProtocol.ts";
import type { WhisperSentinel } from "./t3team-whisperSentinel.ts";

type FakeBehaviour = {
  readonly onLoad?: (variant: string) => "gpu" | "cpu" | "crash";
  readonly onTranscribe?: () => "ok" | "crash";
};

function makeFakeWorkers(behaviour: FakeBehaviour = {}) {
  const spawned: Array<{ variant: string | null; killed: boolean }> = [];
  const spawnWorker = (): WhisperWorkerHandle => {
    const record = { variant: null as string | null, killed: false };
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
            return messageListener({ id: request.id, ok: true, acceleration: outcome });
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
