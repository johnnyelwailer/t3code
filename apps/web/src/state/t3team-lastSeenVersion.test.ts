import { describe, expect, it } from "vite-plus/test";

import { markVersionSeen, readVersionChange } from "./t3team-lastSeenVersion";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("version changed since last seen", () => {
  it("is a change with no previous version on a first run", () => {
    expect(readVersionChange(memory(), "0.1.2-rc.5")).toEqual({ changed: true, previous: null });
  });
  it("is a change with the old version after an update, and none once marked seen", () => {
    const storage = memory();
    markVersionSeen(storage, "0.1.2-rc.4");
    expect(readVersionChange(storage, "0.1.2-rc.5")).toEqual({
      changed: true,
      previous: "0.1.2-rc.4",
    });
    markVersionSeen(storage, "0.1.2-rc.5");
    expect(readVersionChange(storage, "0.1.2-rc.5")).toEqual({
      changed: false,
      previous: "0.1.2-rc.5",
    });
  });
  it("survives unavailable storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readVersionChange(broken, "1.0.0")).toEqual({ changed: true, previous: null });
    expect(() => markVersionSeen(broken, "1.0.0")).not.toThrow();
  });
});
