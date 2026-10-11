import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveT3TeamPackDefaultSetupProfileId } from "~/t3team/t3team-packSetupProfiles";
import {
  readStoredT3TeamProjectSetupProfile,
  readT3TeamProjectSetupProfile,
  T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY,
  writeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";

const descriptor = (
  id: string,
  overrides: Partial<EnvironmentSetupProfile> = {},
): EnvironmentSetupProfile =>
  ({
    id,
    title: id,
    description: id,
    badge: "Badge",
    bullets: ["one"],
    category: "product",
    ...overrides,
  }) as EnvironmentSetupProfile;

function installWindowStub(): void {
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
}

// The second argument is the WORK_PROFILE_CHOOSER gate; every assertion below pins it explicitly
// rather than leaning on whatever the ambient server config happens to advertise.
const CHOOSER_ON = true;
const CHOOSER_OFF = false;

describe("t3team project setup profile helpers", () => {
  it("reads and writes the default setup profile with a safe fallback (chooser on)", () => {
    installWindowStub();

    expect(readT3TeamProjectSetupProfile(undefined, CHOOSER_ON)).toBe("product-partner");

    writeT3TeamProjectSetupProfile("engineering-copilot");
    expect(readT3TeamProjectSetupProfile(undefined, CHOOSER_ON)).toBe("engineering-copilot");
  });

  it("prefers a pack default over the bundled default, but never over a stored id (chooser on)", () => {
    installWindowStub();
    const packProfiles = [
      descriptor("requirements-product", { default: true }),
      descriptor("engineer", { category: "engineering" }),
    ];

    // Nothing stored: the pack default wins over the bundled "product-partner".
    expect(readT3TeamProjectSetupProfile(packProfiles, CHOOSER_ON)).toBe("requirements-product");
    // No pack default: unchanged bundled behaviour.
    expect(readT3TeamProjectSetupProfile(undefined, CHOOSER_ON)).toBe("product-partner");

    writeT3TeamProjectSetupProfile("cloud-engineer");
    // A stored id outranks the pack default.
    expect(readT3TeamProjectSetupProfile(packProfiles, CHOOSER_ON)).toBe("cloud-engineer");
  });

  it("uses the developer profile and leaves the stored choice alone when the chooser is off", () => {
    installWindowStub();
    const packProfiles = [
      descriptor("requirements-product", { default: true }),
      descriptor("engineer", { category: "engineering" }),
      descriptor("second-engineer", { category: "engineering" }),
    ];

    writeT3TeamProjectSetupProfile("requirements-product");

    // The pack's first engineering profile, not the stored pick and not the pack default.
    expect(readT3TeamProjectSetupProfile(packProfiles, CHOOSER_OFF)).toBe("engineer");
    // No pack profiles at all: the bundled engineering profile.
    expect(readT3TeamProjectSetupProfile(undefined, CHOOSER_OFF)).toBe("engineering-copilot");
    // A pack with no engineering profile still falls back to the bundled one.
    expect(readT3TeamProjectSetupProfile([descriptor("only-product")], CHOOSER_OFF)).toBe(
      "engineering-copilot",
    );

    // The stored value is untouched, so turning the flag back on restores the user's own pick.
    expect(readStoredT3TeamProjectSetupProfile()).toBe("requirements-product");
    expect(readT3TeamProjectSetupProfile(packProfiles, CHOOSER_ON)).toBe("requirements-product");
  });

  it("maps pack descriptors to the first default id, ignoring unflagged profiles", () => {
    expect(
      resolveT3TeamPackDefaultSetupProfileId([
        descriptor("plain-role"),
        descriptor("first-default", { default: true }),
        descriptor("second-default", { default: true }),
      ]),
    ).toBe("first-default");
    expect(resolveT3TeamPackDefaultSetupProfileId([descriptor("plain-role")])).toBeUndefined();
    expect(resolveT3TeamPackDefaultSetupProfileId(undefined)).toBeUndefined();
  });
});
