import { describe, expect, it } from "vite-plus/test";
import { createNexiOperationRunner } from "./t3team-nexiOperation";

const deferred = <A = void>() => {
  let resolve!: (value: A) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<A>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function setup() {
  const ui = { busy: false, code: "code" as string | null, error: null as string | null };
  const runner = createNexiOperationRunner({
    setBusy: (value) => {
      ui.busy = value;
    },
    setError: (value) => {
      ui.error = value;
    },
    clearCode: () => {
      ui.code = null;
    },
  });
  /** Starts an action the test settles by hand; `settled` completes after the runner's own cleanup. */
  const start = () => {
    const gate = deferred();
    const seen = { signal: undefined as AbortSignal | undefined };
    const settled = deferred();
    runner.run(async (signal) => {
      seen.signal = signal;
      try {
        await gate.promise;
      } finally {
        queueMicrotask(() => settled.resolve());
      }
    });
    return { gate, seen, settled: settled.promise };
  };
  return { ui, runner, start };
}

describe("Nexi host operations", () => {
  it("shows busy while an operation runs and clears it when it completes", async () => {
    const { ui, start } = setup();
    const op = start();
    expect(ui.busy).toBe(true);
    op.gate.resolve();
    await op.settled;
    await Promise.resolve();
    expect(ui.busy).toBe(false);
    expect(ui.code).toBeNull();
  });
  it("clears busy and the pending code when the flag is turned off mid-operation", () => {
    const { ui, runner, start } = setup();
    const op = start();
    runner.cancel();
    expect(op.seen.signal?.aborted).toBe(true);
    expect(ui.busy).toBe(false);
    expect(ui.code).toBeNull();
  });
  it("ignores a late result and a late failure after the flag was turned off", async () => {
    const { ui, runner, start } = setup();
    const failing = start();
    runner.cancel();
    failing.gate.reject(new Error("late failure"));
    await failing.settled.catch(() => undefined);
    await Promise.resolve();
    expect(ui.error).toBeNull();
    expect(ui.busy).toBe(false);
  });
  it("runs again normally after the flag comes back on", async () => {
    const { ui, runner, start } = setup();
    start();
    runner.cancel();
    const again = start();
    expect(ui.busy).toBe(true);
    again.gate.resolve();
    await again.settled;
    await Promise.resolve();
    expect(ui.busy).toBe(false);
  });
  it("lets a stale operation finish without clearing a newer operation's busy state", async () => {
    const { ui, start } = setup();
    const first = start();
    const second = start();
    expect(first.seen.signal?.aborted).toBe(true);
    first.gate.resolve();
    await first.settled;
    await Promise.resolve();
    expect(ui.busy).toBe(true);
    second.gate.resolve();
    await second.settled;
    await Promise.resolve();
    expect(ui.busy).toBe(false);
  });
  it("aborts without touching state when the screen unmounts", () => {
    const { ui, runner, start } = setup();
    const op = start();
    runner.abort();
    expect(op.seen.signal?.aborted).toBe(true);
    expect(ui.busy).toBe(true);
  });
});
