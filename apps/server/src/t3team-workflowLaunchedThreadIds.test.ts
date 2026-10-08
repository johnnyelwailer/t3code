import { describe, expect, it } from "vite-plus/test";

import {
  launchedThreadIdentity,
  withinRunModes,
  workflowLaunchScope,
} from "./t3team-workflowLaunchedThreadIds.ts";

describe("launched thread identity", () => {
  it("scopes keys to the recipe, so a project copy of a pack recipe keeps its threads", () => {
    const pack = workflowLaunchScope({
      runId: "r1",
      recipePath: "/packs/nexplore/recipes/pr-watch/",
    });
    const project = workflowLaunchScope({
      runId: "r2",
      recipePath: "/repo/.nexi/recipes/pr-watch",
    });
    expect(pack).toBe("recipe:pr-watch");
    expect(project).toBe(pack);
    expect(workflowLaunchScope({ runId: "r3", recipePath: null })).toBe("run:r3");
  });

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
  });
});
