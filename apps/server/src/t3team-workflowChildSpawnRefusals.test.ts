/**
 * The per-run refusal store is the only memory standing between a refused `thread.create` and the
 * author's next awaited verb, and it caps itself so repeated failed spawns cannot grow it without
 * limit (t3team-workflowChildSpawnRefusals.ts). These tests pin that cap's boundary behaviour:
 * what survives at exactly the limit, what the 65th refusal evicts, and that the eviction is
 * oldest-first by RECENCY rather than insertion, so a re-recorded child is not the one dropped.
 *
 * The end-to-end re-raise and successful-retry cleanup are covered through the real broker in
 * t3team-workflowEngineBrokerChildSpawn.test.ts; here the store is exercised directly so the
 * boundary is exact and deterministic, with no host, queue or SDK in the way.
 */
import { describe, expect, it } from "vite-plus/test";

import { makeChildSpawnRefusalStore } from "./t3team-workflowChildSpawnRefusals.ts";

/** One stable error object per index: the store keeps the host's OWN error, so tests compare identity. */
const REFUSALS: ReadonlyArray<Error> = Array.from(
  { length: 128 },
  (_, index) => new Error(`refused ${index}`),
);
const refusal = (index: number) => REFUSALS[index] as Error;

/** The documented default cap: `DEFAULT_LIMIT` in the store, exercised rather than imported. */
const DEFAULT_LIMIT = 64;

describe("childSpawnRefusalStore", () => {
  it("keeps every refusal at exactly the default limit", () => {
    const store = makeChildSpawnRefusalStore();

    for (let index = 0; index < DEFAULT_LIMIT; index += 1) {
      store.record(`child-${index}`, refusal(index));
    }

    for (let index = 0; index < DEFAULT_LIMIT; index += 1) {
      expect(store.refusalFor(`child-${index}`)?.error).toBe(refusal(index));
    }
  });

  it("evicts only the oldest refusal once the 65th distinct child is recorded", () => {
    const store = makeChildSpawnRefusalStore();

    for (let index = 0; index < DEFAULT_LIMIT; index += 1) {
      store.record(`child-${index}`, refusal(index));
    }
    const overflow = refusal(DEFAULT_LIMIT);
    store.record("child-64", overflow);

    // The cap is what degrades an old child's turn back to the pre-existing behaviour, so the
    // evicted child must report NO refusal rather than another child's.
    expect(store.refusalFor("child-0")).toBeUndefined();
    expect(store.refusalFor("child-1")?.error).toBe(refusal(1));
    expect(store.refusalFor("child-63")?.error).toBe(refusal(63));
    expect(store.refusalFor("child-64")?.error).toBe(overflow);

    // Still bounded: the total held does not grow past the cap.
    store.record("child-65", refusal(65));
    expect(store.refusalFor("child-1")).toBeUndefined();
    expect(store.refusalFor("child-2")?.error).toBe(refusal(2));
  });

  it("evicts by recency, so re-recording a refused child moves it behind the others", () => {
    const store = makeChildSpawnRefusalStore();

    for (let index = 0; index < DEFAULT_LIMIT; index += 1) {
      store.record(`child-${index}`, refusal(index));
    }
    // A second refused attempt for the oldest child: it is still the least recent by position...
    const retryError = refusal(100);
    store.record("child-0", retryError);
    // ...so the next overflow drops `child-1`, and `child-0` survives carrying the newer error.
    store.record("child-64", refusal(64));

    expect(store.refusalFor("child-0")?.error).toBe(retryError);
    expect(store.refusalFor("child-1")).toBeUndefined();
    expect(store.refusalFor("child-2")?.error).toBe(refusal(2));
  });

  it("clears a refusal once a later create succeeds, so the child really exists", () => {
    const store = makeChildSpawnRefusalStore();

    store.record("child-1", refusal(1));
    expect(store.refusalFor("child-1")).toBeDefined();

    store.clear("child-1");

    // Undefined here is what lets the awaited verb dispatch a real turn instead of re-raising.
    expect(store.refusalFor("child-1")).toBeUndefined();
    expect(store.refusalFor("child-2")).toBeUndefined();
  });

  it("keeps a cleared child out of the eviction order, so the cap holds a full 64 again", () => {
    const store = makeChildSpawnRefusalStore();

    for (let index = 0; index < DEFAULT_LIMIT; index += 1) {
      store.record(`child-${index}`, refusal(index));
    }
    // The oldest child recovers, freeing its slot without shrinking the cap.
    store.clear("child-0");
    store.record("child-64", refusal(64));

    expect(store.refusalFor("child-0")).toBeUndefined();
    expect(store.refusalFor("child-64")?.error).toBe(refusal(64));
    store.record("child-65", refusal(65));
    expect(store.refusalFor("child-1")).toBeUndefined();
    expect(store.refusalFor("child-2")?.error).toBe(refusal(2));
  });

  it("honours a smaller limit and clamps a non-positive one to a single entry", () => {
    const two = makeChildSpawnRefusalStore(2);
    two.record("child-1", refusal(1));
    two.record("child-2", refusal(2));
    two.record("child-3", refusal(3));
    expect(two.refusalFor("child-1")).toBeUndefined();
    expect(two.refusalFor("child-2")?.error).toBe(refusal(2));
    expect(two.refusalFor("child-3")?.error).toBe(refusal(3));

    // A zero or negative cap would otherwise evict the refusal it just recorded — the store must
    // still remember the failure it is there to carry.
    for (const limit of [0, -5]) {
      const clamped = makeChildSpawnRefusalStore(limit);
      clamped.record("child-1", refusal(1));
      expect(clamped.refusalFor("child-1")?.error).toBe(refusal(1));
      clamped.record("child-2", refusal(2));
      expect(clamped.refusalFor("child-1")).toBeUndefined();
      expect(clamped.refusalFor("child-2")?.error).toBe(refusal(2));
    }
  });

  it("distinguishes a refusal whose error is thrown undefined from no refusal at all", () => {
    const store = makeChildSpawnRefusalStore();

    store.record("child-1", undefined);

    expect(store.refusalFor("child-1")).toBeDefined();
    expect(store.refusalFor("child-1")?.error).toBeUndefined();
    expect(store.refusalFor("child-2")).toBeUndefined();
  });
});
