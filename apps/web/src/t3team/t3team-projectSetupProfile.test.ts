import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveT3TeamPackDefaultSetupProfileId } from "~/t3team/t3team-packSetupProfiles";
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

  it("prefers a pack default over the bundled default, but never over a stored id", () => {
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
    // Nothing stored: the pack default wins over the bundled "product-partner".
    expect(readT3TeamProjectSetupProfile("requirements-product")).toBe("requirements-product");
    // No pack default: unchanged bundled behaviour.
    expect(readT3TeamProjectSetupProfile()).toBe("product-partner");

    writeT3TeamProjectSetupProfile("cloud-engineer");
    // A stored id outranks the pack default.
    expect(readT3TeamProjectSetupProfile("requirements-product")).toBe("cloud-engineer");
  });

  it("maps pack descriptors to the first default id, ignoring unflagged profiles", () => {
    const descriptor = (id: string, isDefault: boolean) =>
      ({
        id,
        title: id,
        description: id,
        badge: "Badge",
        bullets: ["one"],
        category: "engineering",
        ...(isDefault ? { default: true } : {}),
      }) as EnvironmentSetupProfile;

    expect(
      resolveT3TeamPackDefaultSetupProfileId([
        descriptor("plain-role", false),
        descriptor("first-default", true),
        descriptor("second-default", true),
      ]),
    ).toBe("first-default");
    expect(
      resolveT3TeamPackDefaultSetupProfileId([descriptor("plain-role", false)]),
    ).toBeUndefined();
    expect(resolveT3TeamPackDefaultSetupProfileId(undefined)).toBeUndefined();
  });
});
