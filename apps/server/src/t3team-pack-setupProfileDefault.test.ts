import { afterEach, describe, expect, it } from "vite-plus/test";
import { replaceFeatureFlagDatabaseValues } from "@t3tools/project-context/t3teamFeatureFlags";

import {
  isSetupProfileDefault,
  resolveSetupProfileDefaultOverrideId,
} from "./t3team-pack-setupProfileDefault.ts";
import { isWorkProfileChooserEnabled } from "./t3team-workProfileChooserFlag.ts";

const noEnv = () => undefined;

const PROFILES = [
  { id: "requirements-product", category: "product", default: true },
  { id: "engineer", category: "engineering" },
  { id: "cloud-engineer", category: "engineering" },
] as const;

afterEach(() => replaceFeatureFlagDatabaseValues(new Map()));

describe("WORK_PROFILE_CHOOSER flag", () => {
  it("is off by default and follows env > DB > default", () => {
    expect(isWorkProfileChooserEnabled(noEnv)).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "  ")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "yes")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "1")).toBe(true);
    expect(isWorkProfileChooserEnabled(() => "true")).toBe(true);
    expect(isWorkProfileChooserEnabled(() => "ON")).toBe(true);

    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", true]]));
    expect(isWorkProfileChooserEnabled(noEnv)).toBe(true);
    expect(isWorkProfileChooserEnabled(() => "0")).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "off")).toBe(false);

    replaceFeatureFlagDatabaseValues(new Map([["WORK_PROFILE_CHOOSER", false]]));
    expect(isWorkProfileChooserEnabled(noEnv)).toBe(false);
    expect(isWorkProfileChooserEnabled(() => "on")).toBe(true);
  });
});

describe("setup profile default selection", () => {
  it("moves the default to the first engineering profile when the chooser is off", () => {
    expect(resolveSetupProfileDefaultOverrideId(PROFILES, false)).toBe("engineer");
    expect(isSetupProfileDefault(PROFILES[0], "engineer")).toBe(false);
    expect(isSetupProfileDefault(PROFILES[1], "engineer")).toBe(true);
    expect(isSetupProfileDefault(PROFILES[2], "engineer")).toBe(false);
  });

  it("passes the pack's own markers through when the chooser is on", () => {
    expect(resolveSetupProfileDefaultOverrideId(PROFILES, true)).toBeUndefined();
    expect(isSetupProfileDefault(PROFILES[0], undefined)).toBe(true);
    expect(isSetupProfileDefault(PROFILES[1], undefined)).toBe(false);
  });

  it("leaves the pack default alone when no engineering profile exists", () => {
    const profiles = [
      { id: "requirements-product", category: "product", default: true },
      { id: "delivery", category: "delivery" },
    ];
    expect(resolveSetupProfileDefaultOverrideId(profiles, false)).toBeUndefined();
    expect(isSetupProfileDefault(profiles[0]!, undefined)).toBe(true);
    expect(resolveSetupProfileDefaultOverrideId(undefined, false)).toBeUndefined();
  });
});
