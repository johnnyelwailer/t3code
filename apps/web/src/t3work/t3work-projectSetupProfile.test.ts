import { describe, expect, it } from "vite-plus/test";

import {
  readT3workProjectSetupProfile,
  T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY,
  writeT3workProjectSetupProfile,
} from "~/t3work/t3work-projectSetupProfile";

describe("t3work project setup profile helpers", () => {
  it("reads and writes the default setup profile with a safe fallback", () => {
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
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window & typeof globalThis;

    Object.defineProperty(globalThis, "window", {
      value: windowStub,
      configurable: true,
      writable: true,
    });

    window.localStorage.removeItem(T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY);
    expect(readT3workProjectSetupProfile()).toBe("product-owner");

    writeT3workProjectSetupProfile("developer");
    expect(readT3workProjectSetupProfile()).toBe("developer");
  });
});
