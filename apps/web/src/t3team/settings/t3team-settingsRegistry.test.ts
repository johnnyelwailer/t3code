import { describe, expect, it } from "vite-plus/test";

import {
  searchableSetting,
  searchSettings,
  SETTINGS_NAV_GROUPS,
} from "../../components/settings/settingsSearch";
import {
  T3TEAM_SETTINGS_SEARCH_ITEMS,
  t3teamSettingsNavGroups,
  t3teamSettingsRows,
  T3TEAM_SETTINGS_SECTIONS,
} from "./t3team-settingsRegistry";
import { T3TEAM_SETTINGS_ROWS } from "./t3team-settingsForkRows";

describe("t3team settings registry", () => {
  it("registers every fork row with a slot, key, label and search anchor", () => {
    expect(T3TEAM_SETTINGS_ROWS.map((row) => [row.slot, row.key, row.anchorId])).toEqual([
      ["agent", "agentInstructions", "agent-personality"],
      ["voice", "voice", "voice-model"],
      ["display", "t3team.activityLabels", "live-activity-labels"],
      ["display", "t3team.projectScopePills", "project-scope-pills"],
      ["interface", "projectSetup", "project-workspace"],
      ["interface", "t3team:beta-flags", "mywork-digest-beta"],
      ["interface", "t3team:companion-enabled", "t3team-companion"],
      ["labs", "featureFlags", "nexi-feature-switches"],
      ["legal", "openSourceLicenses", "open-source-licenses"],
    ]);
  });

  it("registers the connected-tools section after providers", () => {
    expect(T3TEAM_SETTINGS_SECTIONS).toEqual([
      expect.objectContaining({
        path: "/settings/connected-tools",
        after: "/settings/providers",
      }),
    ]);
    const groups = t3teamSettingsNavGroups();
    const providersGroup = groups.find((group) => group.paths.includes("/settings/providers"));
    expect(providersGroup?.paths[providersGroup.paths.indexOf("/settings/providers") + 1]).toBe(
      "/settings/connected-tools",
    );
  });

  it("splices the fork section into every nav group exactly where the data says", () => {
    const groups = t3teamSettingsNavGroups();
    const upstreamFlattened = SETTINGS_NAV_GROUPS.flatMap((group) => group.paths);
    const registryFlattened = groups.flatMap((group) => group.paths);
    expect(registryFlattened).toEqual([
      ...upstreamFlattened.slice(0, upstreamFlattened.indexOf("/settings/providers") + 1),
      "/settings/connected-tools",
      ...upstreamFlattened.slice(upstreamFlattened.indexOf("/settings/providers") + 1),
    ]);
  });

  it("carries the fork search items with their labels and pages", () => {
    const byId = new Map(T3TEAM_SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item]));
    expect(byId.get("live-activity-labels")).toEqual(
      expect.objectContaining({ to: "/settings/general", title: "Live activity labels" }),
    );
    expect(byId.get("project-scope-pills")?.searchTerms).toEqual([
      "sidebar recent projects filter pull requests scope experimental",
    ]);
    expect(byId.get("voice-model")?.desktopOnly).toBe(true);
    expect(byId.get("connected-tools")).toEqual(
      expect.objectContaining({
        to: "/settings/connected-tools",
        sectionLabel: "Connected Tools",
      }),
    );
    expect(byId.get("nexi-feature-switches")).toEqual(
      expect.objectContaining({ to: "/settings/labs", targetId: "features-nexi" }),
    );
    expect(byId.get("project-workspace")).toEqual(
      expect.objectContaining({ to: "/settings/appearance", targetId: "appearance-interface" }),
    );
    expect(byId.get("t3team-companion")).toEqual(
      expect.objectContaining({ to: "/settings/appearance", title: "Animated companion" }),
    );
    expect(byId.get("t3team-companion")).not.toHaveProperty("targetId");
  });

  it("keeps every fork search id unique", () => {
    const ids = T3TEAM_SETTINGS_SEARCH_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps searchableSetting resolvable for every anchored fork row", () => {
    for (const row of T3TEAM_SETTINGS_ROWS) {
      expect(searchableSetting(row.anchorId)).toEqual({
        id: row.anchorId,
        title: row.label,
      });
    }
    expect(searchableSetting("voice-silence")).toEqual({
      id: "voice-silence",
      title: "Voice silence",
    });
  });

  it("finds fork rows through the registry items, including by section name", () => {
    const items = T3TEAM_SETTINGS_SEARCH_ITEMS;
    expect(searchSettings("activity labels", items).map((item) => item.id)).toContain(
      "live-activity-labels",
    );
    expect(searchSettings("scope pills", items).map((item) => item.id)).toContain(
      "project-scope-pills",
    );
    expect(searchSettings("connected tools", items).map((item) => item.id)).toContain(
      "connected-tools",
    );
    expect(searchSettings("personality", items).map((item) => item.id)).toContain(
      "agent-personality",
    );
    expect(searchSettings("companion", items).map((item) => item.id)).toContain(
      "t3team-companion",
    );
  });

  it("renders each registered row component exactly once per slot", () => {
    const props = {
      settings: {} as never,
      updateSettings: () => {},
    };
    for (const row of T3TEAM_SETTINGS_ROWS) {
      expect(t3teamSettingsRows(row.slot, props)).toHaveLength(
        T3TEAM_SETTINGS_ROWS.filter((candidate) => candidate.slot === row.slot).length,
      );
      for (const other of T3TEAM_SETTINGS_ROWS.filter((candidate) => candidate.slot !== row.slot)) {
        expect(t3teamSettingsRows(other.slot, props)).toHaveLength(
          T3TEAM_SETTINGS_ROWS.filter((candidate) => candidate.slot === other.slot).length,
        );
      }
    }
  });
});
