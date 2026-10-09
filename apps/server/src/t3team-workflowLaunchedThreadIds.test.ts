import { describe, expect, it } from "vite-plus/test";

import {
  launchedThreadIdentity,
  modesAbove,
  withinRunModes,
} from "./t3team-workflowLaunchedThreadIds.ts";

describe("launched thread identity", () => {
  it("derives one stable id per project, scope and key", () => {
    const base = { projectId: "p1", scope: "recipe:pr-watch", key: "pr:github.com/a/b#1" };
    const id = launchedThreadIdentity(base);
    expect(launchedThreadIdentity(base)).toEqual(id);
    expect(id.threadId).toMatch(/^t3team-launch:[0-9a-f]{32}$/);
    for (const other of [
      { ...base, projectId: "p2" },
      { ...base, scope: "recipe:other" },
      { ...base, key: "pr:github.com/a/b#2" },
    ]) {
      expect(launchedThreadIdentity(other).threadId).not.toBe(id.threadId);
    }
  });

  it("keeps a launched thread within the run's modes", () => {
    const run = { runtimeMode: "auto-accept-edits", interactionMode: "default" } as const;
    expect(withinRunModes(run, {})).toEqual(run);
    expect(
      withinRunModes(run, { runtimeMode: "approval-required", interactionMode: "plan" }),
    ).toEqual({ runtimeMode: "approval-required", interactionMode: "plan" });
    expect(withinRunModes(run, { runtimeMode: "full-access" })).toEqual({
      refused: "Runtime mode full-access is above this run's auto-accept-edits.",
    });
    expect(
      withinRunModes({ ...run, interactionMode: "plan" }, { interactionMode: "default" }),
    ).toHaveProperty("refused");
    expect(withinRunModes(run, { runtimeMode: "root" })).toHaveProperty("refused");
    expect(withinRunModes(run, { runtimeMode: "constructor" })).toHaveProperty("refused");
    expect(modesAbove({ runtimeMode: "full-access", interactionMode: "default" }, run)).toBe(true);
    expect(modesAbove({ runtimeMode: "auto-accept-edits", interactionMode: "plan" }, run)).toBe(
      false,
    );
  });
});
