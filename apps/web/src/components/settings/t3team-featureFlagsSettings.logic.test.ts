import type { FeatureFlagView } from "@t3tools/contracts";
import { FEATURE_FLAG_GROUPS, listFeatureFlags } from "@t3tools/project-context/t3teamFeatureFlags";
import { describe, expect, it } from "vite-plus/test";

import {
  featureFlagFreshness,
  featureFlagGroupSummary,
  featureFlagLockReason,
  featureFlagSourceChip,
  groupFeatureFlags,
  withPendingValue,
} from "./t3team-featureFlagsSettings.logic";
import {
  FIXTURE_ENV_FLAG,
  FIXTURE_PRESET,
  FIXTURE_USER_FLAGS,
  buildFeatureFlagsViewFixture,
} from "./t3team-featureFlagsSettings.fixture";

const flag = (
  overrides: Partial<FeatureFlagView> & Pick<FeatureFlagView, "key">,
): FeatureFlagView => ({
  group: "Agent",
  label: overrides.key,
  description: "",
  scope: "vendor",
  enabled: false,
  source: "default",
  envName: `NEXI_FF_${overrides.key}`,
  requiresRestart: false,
  restartPending: false,
  userToggleable: true,
  ...overrides,
});

const NOW = new Date("2026-11-06T12:00:00Z");

describe("groupFeatureFlags", () => {
  it("orders sections by the view's groups, skips empty ones and appends unknown groups", () => {
    const sections = groupFeatureFlags({
      groups: ["Agent", "Ops", "Platform"],
      flags: [
        flag({ key: "B", group: "Platform" }),
        flag({ key: "P", group: "Pack only" }),
        flag({ key: "A", group: "Agent", enabled: true }),
      ],
    });
    expect(sections.map((section) => section.group)).toEqual(["Agent", "Platform", "Pack only"]);
    expect(featureFlagGroupSummary(sections[0]!, NOW)).toBe("1 of 1 on");
  });

  it("nests subgroups one level inside their group, keeping registry order", () => {
    const [section] = groupFeatureFlags({
      groups: ["Agent"],
      flags: [
        flag({ key: "T1", subgroup: "Tools" }),
        flag({ key: "TOP" }),
        flag({ key: "N1", subgroup: "Nexplore AI" }),
        flag({ key: "T2", subgroup: "Tools" }),
      ],
    });
    expect(section?.flags.map((entry) => entry.key)).toEqual(["TOP"]);
    expect(
      section?.subgroups.map((subgroup) => [subgroup.name, subgroup.flags.map((f) => f.key)]),
    ).toEqual([
      ["Tools", ["T1", "T2"]],
      ["Nexplore AI", ["N1"]],
    ]);
    expect(section?.totalCount).toBe(4);
  });

  it("places every registered host flag and the fixture's pack flags exactly once", () => {
    const view = buildFeatureFlagsViewFixture();
    const sections = groupFeatureFlags(view);
    const placed = sections.flatMap((section) => [
      ...section.flags,
      ...section.subgroups.flatMap((subgroup) => subgroup.flags),
    ]);
    expect(placed.map((entry) => entry.key).toSorted()).toEqual(
      view.flags.map((entry) => entry.key).toSorted(),
    );
    expect(placed.length).toBe(listFeatureFlags().length + 3);
    expect(sections.every((section) => FEATURE_FLAG_GROUPS.some((g) => g === section.group))).toBe(
      true,
    );
  });
});

describe("featureFlagFreshness", () => {
  it("marks a switch New for 30 days and names the month it arrived", () => {
    expect(featureFlagFreshness({ addedOn: "2026-10-30" }, NOW)).toEqual({
      isNew: true,
      label: "Since Oct 2026",
    });
    expect(featureFlagFreshness({ addedOn: "2026-10-06" }, NOW)).toEqual({
      isNew: false,
      label: "Since Oct 2026",
    });
  });

  it("calls a switch without a usable date Established", () => {
    expect(featureFlagFreshness({}, NOW)).toEqual({ isNew: false, label: "Established" });
    expect(featureFlagFreshness({ addedOn: "soon" }, NOW)).toEqual({
      isNew: false,
      label: "Established",
    });
  });

  it("counts the new switches of a group, subgroups included", () => {
    const [section] = groupFeatureFlags({
      groups: ["Agent"],
      flags: [
        flag({ key: "A", enabled: true, addedOn: "2026-11-01" }),
        flag({ key: "B", subgroup: "Tools", addedOn: "2026-10-20" }),
        flag({ key: "C", subgroup: "Tools" }),
      ],
    });
    expect(featureFlagGroupSummary(section!, NOW)).toBe("1 of 3 on · 2 new");
  });
});

describe("featureFlagSourceChip", () => {
  it("names the env variable, the user, the preset flavor and the default", () => {
    expect(featureFlagSourceChip(flag({ key: "X", source: "env" }), undefined).label).toBe(
      "Set by NEXI_FF_X",
    );
    expect(featureFlagSourceChip(flag({ key: "X", source: "user" }), "nightly").label).toBe(
      "Your choice",
    );
    expect(featureFlagSourceChip(flag({ key: "X", source: "preset" }), "nightly").label).toBe(
      "Release preset · nightly",
    );
    expect(featureFlagSourceChip(flag({ key: "X", source: "preset" }), undefined).label).toBe(
      "Release preset",
    );
    expect(featureFlagSourceChip(flag({ key: "X" }), undefined).label).toBe("Default");
  });
});

describe("featureFlagLockReason", () => {
  it("locks env overrides and release-only flags even with permission", () => {
    expect(featureFlagLockReason(flag({ key: "X", source: "env" }), true)).toContain("NEXI_FF_X");
    expect(featureFlagLockReason(flag({ key: "X", userToggleable: false }), true)).not.toBeNull();
    expect(featureFlagLockReason(flag({ key: "X" }), false)).toContain("permission");
    expect(featureFlagLockReason(flag({ key: "X", source: "user" }), true)).toBeNull();
  });
});

describe("withPendingValue", () => {
  it("shows a sent boolean at once and keeps the current value while a reset is in flight", () => {
    const current = flag({ key: "X", enabled: false });
    expect(withPendingValue(current, true).enabled).toBe(true);
    expect(withPendingValue(current, null)).toBe(current);
    expect(withPendingValue(current, undefined)).toBe(current);
  });
});

describe("buildFeatureFlagsViewFixture", () => {
  it("resolves the documented mix through the registry and leaves no state behind", () => {
    const view = buildFeatureFlagsViewFixture();
    const byKey = new Map(view.flags.map((entry) => [entry.key, entry]));
    expect(view.preset).toBe(FIXTURE_PRESET);
    expect(byKey.get(FIXTURE_ENV_FLAG)?.source).toBe("env");
    expect(FIXTURE_USER_FLAGS.map((key) => byKey.get(key)?.source)).toEqual(["user", "user"]);
    expect(view.flags.filter((entry) => entry.restartPending).map((entry) => entry.key)).toEqual([
      "ORCHESTRATION_SIGNAL_SOURCES",
    ]);
    expect(listFeatureFlags().some((entry) => entry.scope === "pack")).toBe(false);
  });
});
