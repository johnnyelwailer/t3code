import { beforeEach, describe, expect, it } from "vite-plus/test";

import { readProjectSprintChoice, writeProjectSprintChoice } from "./t3team-projectSprintChoice";

describe("project sprint choice", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => data.get(k) ?? null,
          setItem: (k: string, v: string) => void data.set(k, v),
          removeItem: (k: string) => void data.delete(k),
        },
        dispatchEvent: () => true,
      },
    });
    (globalThis as { CustomEvent?: unknown }).CustomEvent ??= class {
      constructor(public type: string) {}
    };
  });
  it("round-trips per project and clears", () => {
    writeProjectSprintChoice("p1", { boardId: "95", sprintId: "7228" });
    expect(readProjectSprintChoice("p1")).toEqual({ boardId: "95", sprintId: "7228" });
    expect(readProjectSprintChoice("p2")).toBeUndefined();
    writeProjectSprintChoice("p1", { boardId: "95" });
    expect(readProjectSprintChoice("p1")).toEqual({ boardId: "95" });
    writeProjectSprintChoice("p1", undefined);
    expect(readProjectSprintChoice("p1")).toBeUndefined();
  });
});
