import { describe, expect, it } from "vite-plus/test";
import type { ProjectThread } from "~/t3team/t3team-types";
import {
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
} from "./t3team-projectSidebarStatusPills";
import { resolveActivityPillDisplay } from "~/t3team/t3team-activityStateDisplay";

const runningThread: Pick<ProjectThread, "status" | "activityLabel"> = {
  status: "running",
  activityLabel: "Running tests",
};

describe("resolveThreadStatusPill (activity label)", () => {
  it("shows the live label on a running thread while keeping the stable label", () => {
    expect(resolveThreadStatusPill(runningThread)).toMatchObject({
      label: "Working",
      activityLabel: "Running tests",
      pulse: true,
    });
  });

  it("respects the settings flag: off → static Working only", () => {
    const pill = resolveThreadStatusPill(runningThread, { activityLabelsEnabled: false });
    expect(pill).toMatchObject({ label: "Working" });
    expect(pill?.activityLabel).toBeUndefined();
  });

  it("treats an empty/whitespace label as absent", () => {
    const pill = resolveThreadStatusPill(
      { ...runningThread, activityLabel: "   " },
      {
        activityLabelsEnabled: true,
      },
    );
    expect(pill?.activityLabel).toBeUndefined();
  });

  it("never attaches a label to settled statuses", () => {
    const pill = resolveThreadStatusPill({
      status: "completed" as const,
      activityLabel: "Running tests",
    });
    expect(pill).toMatchObject({ label: "Completed" });
    expect(pill?.activityLabel).toBeUndefined();
  });
});

describe("resolveProjectStatusIndicator (activity label rollup)", () => {
  it("propagates the live label from the most active thread", () => {
    const threads = [
      { status: "completed" as const },
      { status: "running" as const, activityLabel: "Fixing auth bug" },
    ] as ProjectThread[];
    expect(resolveProjectStatusIndicator(threads)).toMatchObject({
      label: "Working",
      activityLabel: "Fixing auth bug",
    });
  });

  it("keeps the rollup static when the flag is off", () => {
    const threads = [
      { status: "running" as const, activityLabel: "Fixing auth bug" },
    ] as ProjectThread[];
    const pill = resolveProjectStatusIndicator(threads, { activityLabelsEnabled: false });
    expect(pill).toMatchObject({ label: "Working" });
    expect(pill?.activityLabel).toBeUndefined();
  });
});

describe("resolveThreadStatusPill (live label, GHE #40)", () => {
  it("a running row shows the LLM label through the shared display helper, else Working", () => {
    const labelled = resolveThreadStatusPill({
      status: "running",
      activityLabel: "editing the retry test",
    });
    expect(labelled).toMatchObject({ label: "Working", pulse: true });
    expect(resolveActivityPillDisplay(labelled!)).toBe("editing the retry test");

    const gated = resolveThreadStatusPill(
      { status: "running", activityLabel: "editing the retry test" },
      { activityLabelsEnabled: false },
    );
    expect(gated?.activityLabel).toBeUndefined();
    expect(resolveActivityPillDisplay(gated!)).toBe("Working");
  });
});
