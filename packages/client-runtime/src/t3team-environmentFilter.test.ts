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
      selectedId: null,
    });
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
