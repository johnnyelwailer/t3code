import { describe, expect, it } from "vite-plus/test";

import { createPassChain } from "./t3team-voicePassChain.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("createPassChain", () => {
  it("starts a pass at once when nothing is running", () => {
    const chain = createPassChain();
    const started: string[] = [];
    void chain.run(async () => started.push("a"));
    expect(started).toEqual(["a"]);
    expect(chain.busy).toBe(true);
  });

  it("runs passes one at a time, in the order they were asked", async () => {
    const chain = createPassChain();
    const first = deferred<string>();
    const order: string[] = [];
    const a = chain.run(() => {
      order.push("a");
      return first.promise;
    });
    const b = chain.run(async () => {
      order.push("b");
      return "b";
    });
    await Promise.resolve();
    expect(order).toEqual(["a"]);
    first.resolve("a");
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(order).toEqual(["a", "b"]);
  });

  it("is not busy again as soon as the last pass settled, even a failed one", async () => {
    const chain = createPassChain();
    const failing = chain.run(() => Promise.reject(new Error("boom")));
    await expect(failing).rejects.toThrow("boom");
    expect(chain.busy).toBe(false);
    expect(await chain.run(async () => "next")).toBe("next");
  });

  it("goes on after a pass fails, and idle waits for everything started so far", async () => {
    const chain = createPassChain();
    const gate = deferred<void>();
    const results: string[] = [];
    void chain.run(() => gate.promise).catch(() => undefined);
    void chain.run(async () => results.push("second"));
    const idle = chain.idle().then(() => results.push("idle"));
    gate.reject(new Error("first failed"));
    await idle;
    expect(results).toEqual(["second", "idle"]);
  });
});
