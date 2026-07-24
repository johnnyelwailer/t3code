import { describe, expect, it } from "vite-plus/test";

import {
  readT3TeamProjectSetupProfile,
  T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY,
  writeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";

describe("t3team project setup profile helpers", () => {
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

    window.localStorage.removeItem(T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY);
    expect(readT3TeamProjectSetupProfile()).toBe("product-partner");

    writeT3TeamProjectSetupProfile("engineering-copilot");
    expect(readT3TeamProjectSetupProfile()).toBe("engineering-copilot");
  });
});
