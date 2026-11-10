import { describe, expect, it } from "vite-plus/test";

import { resolveEnvironmentFilter } from "./t3team-environmentFilter.ts";

const primary = { id: "env-local", label: "This computer", isPrimary: true };
const cloud = { id: "env-cloud-1234", label: "Cloud session", isPrimary: false };
const server = { id: "env-server", label: "Build server" };

describe("resolveEnvironmentFilter", () => {
  it("hides the control with none or only one environment", () => {
    expect(resolveEnvironmentFilter({ environments: [], selectedId: null }).pills).toBeNull();
    expect(
      resolveEnvironmentFilter({ environments: [primary], selectedId: null }).pills,
    ).toBeNull();
    expect(
      resolveEnvironmentFilter({ environments: [primary, { ...primary }], selectedId: null }).pills,
    ).toBeNull();
  });

  it("offers All and one pill per environment, primary first then by label", () => {
    const { pills } = resolveEnvironmentFilter({
      environments: [server, cloud, primary],
      selectedId: null,
    });
    expect(pills).toEqual([
      { id: null, label: "All", selected: true },
      { id: "env-local", label: "This computer", selected: false },
      { id: "env-server", label: "Build server", selected: false },
      { id: "env-cloud-1234", label: "Cloud session", selected: false },
    ]);
  });

  it("marks the selected environment and keeps it", () => {
    const filter = resolveEnvironmentFilter({
      environments: [primary, cloud],
      selectedId: "env-cloud-1234",
    });
    expect(filter.selectedId).toBe("env-cloud-1234");
    expect(filter.pills?.map((pill) => pill.selected)).toEqual([false, false, true]);
  });

  it("falls back to All when the selected environment is gone", () => {
    const filter = resolveEnvironmentFilter({ environments: [primary, cloud], selectedId: "gone" });
    expect(filter.selectedId).toBeNull();
    expect(filter.pills?.[0]?.selected).toBe(true);
  });

  it("falls back to All and hides when only the primary is left", () => {
    expect(
      resolveEnvironmentFilter({ environments: [primary], selectedId: "env-cloud-1234" }),
    ).toEqual({
      pills: null,
      hiddenPills: [],
      selectedId: null,
    });
  });

  it("moves hidden environments out of the pills and into hiddenPills", () => {
    const filter = resolveEnvironmentFilter({
      environments: [primary, cloud, server],
      selectedId: null,
      hiddenIds: ["env-server"],
    });
    expect(filter.pills?.map((pill) => pill.id)).toEqual([null, "env-local", "env-cloud-1234"]);
    expect(filter.hiddenPills).toEqual([
      { id: "env-server", label: "Build server", selected: false },
    ]);
  });

  it("reads a hidden selection as All, and keeps the control while anything is hidden", () => {
    const hidden = resolveEnvironmentFilter({
      environments: [primary, cloud, server],
      selectedId: "env-cloud-1234",
      hiddenIds: ["env-cloud-1234"],
    });
    expect(hidden.selectedId).toBeNull();
    expect(hidden.pills?.map((pill) => pill.selected)).toEqual([true, false, false]);
    const allButPrimaryHidden = resolveEnvironmentFilter({
      environments: [primary, cloud],
      selectedId: null,
      hiddenIds: ["env-cloud-1234"],
    });
    expect(allButPrimaryHidden.pills?.map((pill) => pill.id)).toEqual([null, "env-local"]);
    expect(allButPrimaryHidden.hiddenPills.map((pill) => pill.id)).toEqual(["env-cloud-1234"]);
  });

  it("keeps the All pill so every hidden environment can be brought back", () => {
    const filter = resolveEnvironmentFilter({
      environments: [cloud, server],
      selectedId: null,
      hiddenIds: new Set(["env-cloud-1234", "env-server"]),
    });
    expect(filter.pills?.map((pill) => pill.id)).toEqual([null]);
    expect(filter.hiddenPills.map((pill) => pill.id)).toEqual(["env-server", "env-cloud-1234"]);
  });

  it("tells pills with the same label apart and fills in a blank label", () => {
    const { pills } = resolveEnvironmentFilter({
      environments: [
        primary,
        { id: "aaaa-0001", label: "Cloud session" },
        { id: "aaaa-0002", label: "Cloud session" },
        { id: "aaaa-0003", label: "  " },
      ],
      selectedId: null,
    });
    expect(pills?.map((pill) => pill.label)).toEqual([
      "All",
      "This computer",
      "aaaa-0003",
      "Cloud session (0001)",
      "Cloud session (0002)",
    ]);
  });

  // The fixtures of the mobile pack's `environmentChips` test (nexiProjectPills.test.ts). One
  // deliberate difference: a selection that outlives its environment falls back to All, where the
  // mobile row stays so the stale filter can be cleared by hand.
  it("matches the mobile chips for two environments", () => {
    const environments = [
      { id: "e1", label: "Mac" },
      { id: "e2", label: "Cloud" },
    ];
    expect(resolveEnvironmentFilter({ environments, selectedId: "e2" }).pills).toEqual([
      { id: null, label: "All", selected: false },
      { id: "e2", label: "Cloud", selected: true },
      { id: "e1", label: "Mac", selected: false },
    ]);
  });
});
