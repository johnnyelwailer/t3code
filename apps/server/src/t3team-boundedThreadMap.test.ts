import { describe, expect, it } from "vite-plus/test";
import { createBoundedThreadMap } from "./t3team-boundedThreadMap.ts";

describe("bounded thread map (GHE #203)", () => {
  it("behaves like a plain map under the cap", () => {
    const map = createBoundedThreadMap<string>(3);
    expect(map.size).toBe(0);
    map.set("t1", "a");
    map.set("t2", "b");
    expect(map.get("t1")).toBe("a");
    expect(map.has("t2")).toBe(true);
    expect(map.has("t3")).toBe(false);
    expect(map.size).toBe(2);
    map.delete("t1");
    expect(map.has("t1")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("updating an existing key never evicts anything", () => {
    const map = createBoundedThreadMap<string>(2);
    map.set("t1", "a");
    map.set("t2", "b");
    map.set("t1", "a-updated"); // key already tracked: no eviction
    expect(map.size).toBe(2);
    expect(map.get("t1")).toBe("a-updated");
    expect(map.get("t2")).toBe("b");
  });

  it("evicts the oldest key once a new key would push it over the cap", () => {
    const map = createBoundedThreadMap<string>(2);
    map.set("t1", "a");
    map.set("t2", "b");
    map.set("t3", "c"); // t1 is oldest: evicted
    expect(map.size).toBe(2);
    expect(map.has("t1")).toBe(false);
    expect(map.get("t2")).toBe("b");
    expect(map.get("t3")).toBe("c");
  });

  it("calls onEvict with the evicted key and value, and only on eviction", () => {
    const evicted: Array<{ key: string; value: string }> = [];
    const map = createBoundedThreadMap<string>(2, (key, value) => {
      evicted.push({ key, value });
    });
    map.set("t1", "a");
    map.set("t2", "b");
    expect(evicted).toEqual([]);
    map.set("t3", "c");
    expect(evicted).toEqual([{ key: "t1", value: "a" }]);
    map.set("t2", "b-updated"); // existing key: no eviction
    expect(evicted).toEqual([{ key: "t1", value: "a" }]);
  });

  it("caps at a realistic size (500) and keeps only the most recent keys", () => {
    const max = 500;
    const map = createBoundedThreadMap<number>(max);
    for (let index = 0; index < max + 10; index += 1) {
      map.set(`t${index}`, index);
    }
    expect(map.size).toBe(max);
    expect(map.has("t0")).toBe(false); // oldest 10 evicted
    expect(map.has("t9")).toBe(false);
    expect(map.get(`t${max + 9}`)).toBe(max + 9); // most recent still tracked
  });
});
