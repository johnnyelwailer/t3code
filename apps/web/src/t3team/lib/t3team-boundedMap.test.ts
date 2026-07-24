import { describe, expect, it } from "vite-plus/test";
import { BoundedMap } from "./t3team-boundedMap";

describe("BoundedMap", () => {
  it("stores and retrieves values under the cap", () => {
    const map = new BoundedMap<string, number>({ maxEntries: 3 });

    map.set("a", 1);
    map.set("b", 2);

    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.size).toBe(2);
  });

  it("evicts the least-recently-used entry once the cap is exceeded", () => {
    const map = new BoundedMap<string, number>({ maxEntries: 2 });

    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
    expect(map.size).toBe(2);
  });

  it("treats get() as a recency touch so recently read entries survive eviction", () => {
    const map = new BoundedMap<string, number>({ maxEntries: 2 });

    map.set("a", 1);
    map.set("b", 2);
    map.get("a"); // "a" is now more recent than "b"
    map.set("c", 3);

    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(1);
    expect(map.get("c")).toBe(3);
  });

  it("re-inserting an existing key updates its value and recency without growing size", () => {
    const map = new BoundedMap<string, number>({ maxEntries: 2 });

    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10);
    map.set("c", 3);

    expect(map.size).toBe(2);
    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(10);
    expect(map.get("c")).toBe(3);
  });

  it("clears all entries", () => {
    const map = new BoundedMap<string, number>({ maxEntries: 2 });
    map.set("a", 1);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.has("a")).toBe(false);
  });
});
