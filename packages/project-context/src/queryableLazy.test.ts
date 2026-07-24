import { describe, expect, it } from "vite-plus/test";

import { isQueryable, type QueryableState } from "./queryable.ts";
import { createLazyQueryable } from "./queryableLazy.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Lazy queryables", () => {
  it("returns sentinel results in idle state and triggers a single load on first access", async () => {
    const gate = deferred<ReadonlyArray<string>>();
    let loadCalls = 0;
    const states: Array<QueryableState> = [];
    const values = createLazyQueryable(
      () => {
        loadCalls += 1;
        return gate.promise;
      },
      { onStateChange: (state) => states.push(state) },
    );

    expect(values.state).toBe("idle");

    // Access in idle: sentinel results (false / 0 / undefined) + load kicked off once.
    expect(values.some()).toBe(false);
    expect(values.count()).toBe(0);
    expect(values.first()).toBeUndefined();
    expect(values.toReadonlyArray()).toEqual([]);
    expect(values.state).toBe("loading");
    expect(loadCalls).toBe(1);

    gate.resolve(["alpha", "beta", "gamma"]);
    await gate.promise;

    expect(states).toEqual(["loading", "ready"]);
    expect(values.state).toBe("ready");
    expect(values.some()).toBe(true);
    expect(values.count()).toBe(3);
    expect(values.first()).toBe("alpha");
    expect(loadCalls).toBe(1);
  });

  it("supports where() chaining across the not-ready and ready phases", async () => {
    const gate = deferred<ReadonlyArray<string>>();
    const values = createLazyQueryable(() => gate.promise);

    const filtered = values
      .where((value) => value.startsWith("b"))
      .where((value) => value.length > 3);
    expect(isQueryable(filtered)).toBe(true);
    expect(filtered.state).toBe("idle");

    // Sentinel evaluation on the derived view still starts the source load.
    expect(filtered.some()).toBe(false);
    expect(values.state).toBe("loading");
    expect(filtered.state).toBe("loading");

    gate.resolve(["beta", "bo", "gamma", "brick"]);
    await gate.promise;

    expect(filtered.state).toBe("ready");
    expect(filtered.toReadonlyArray()).toEqual(["beta", "brick"]);
    expect(filtered.count()).toBe(2);
    expect(filtered.first()).toBe("beta");
    expect(values.where((value) => value === "gamma").count()).toBe(1);
  });

  it("serializes as { state, items } before and after resolution", async () => {
    const gate = deferred<ReadonlyArray<number>>();
    const values = createLazyQueryable(() => gate.promise);

    expect(values.toJSON()).toEqual({ state: "loading", items: [] });

    gate.resolve([1, 2]);
    await gate.promise;

    expect(values.toJSON()).toEqual({ state: "ready", items: [1, 2] });
  });

  it("transitions to error on load failure and keeps returning sentinels", async () => {
    const states: Array<QueryableState> = [];
    const values = createLazyQueryable<string>(() => Promise.reject(new Error("boom")), {
      onStateChange: (state) => states.push(state),
    });

    expect(values.some()).toBe(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(values.state).toBe("error");
    expect(states).toEqual(["loading", "error"]);
    expect(values.count()).toBe(0);
    expect(values.first()).toBeUndefined();
    expect(values.where(() => true).toReadonlyArray()).toEqual([]);
  });
});
