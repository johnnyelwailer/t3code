import settingsPanelsSource from "../components/settings/SettingsPanels.tsx?raw";

import { describe, expect, it } from "vitest";

import {
  readT3workWorkMode,
  T3WORK_WORK_MODE_STORAGE_KEY,
  writeT3workWorkMode,
} from "./t3work-workMode";

describe("t3work work mode helpers", () => {
  it("reads/writes storage with safe default", () => {
    const storage = new Map<string, string>();
    const windowStub = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    } as unknown as Window & typeof globalThis;

    Object.defineProperty(globalThis, "window", {
      value: windowStub,
      configurable: true,
      writable: true,
    });

    window.localStorage.removeItem(T3WORK_WORK_MODE_STORAGE_KEY);
    expect(readT3workWorkMode()).toBe("t3work");

    writeT3workWorkMode("classic");
    expect(readT3workWorkMode()).toBe("classic");

    writeT3workWorkMode("t3work");
    expect(readT3workWorkMode()).toBe("t3work");
  });
});

describe("t3work settings seam", () => {
  it("keeps the General Settings insertion seam mounted", () => {
    expect(settingsPanelsSource).toContain("T3work settings insertion seam");
    expect(settingsPanelsSource).toContain("<T3workWorkModeSetting />");
  });
});
