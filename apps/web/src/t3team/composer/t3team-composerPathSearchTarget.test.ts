import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ComposerTrigger } from "~/composer-logic";
import {
  isT3TeamComposerPathSearchTargetQueryable,
  resolveT3TeamComposerPathSearchTarget,
} from "~/t3team/composer/t3team-composerPathSearchTarget";

const environmentId = "env-primary" as EnvironmentId;

const pathTrigger: ComposerTrigger = {
  kind: "path",
  query: "AGENTS",
  rangeStart: 0,
  rangeEnd: 7,
};

const skillTrigger: ComposerTrigger = {
  kind: "skill",
  query: "review",
  rangeStart: 0,
  rangeEnd: 7,
};

describe("resolveT3TeamComposerPathSearchTarget", () => {
  it("passes cwd and query through for a path trigger so the file search actually runs", () => {
    const target = resolveT3TeamComposerPathSearchTarget(pathTrigger, {
      environmentId,
      cwd: "/Users/pj/.t3code/t3team/projects/IES NG",
    });

    expect(target).toEqual({
      environmentId,
      cwd: "/Users/pj/.t3code/t3team/projects/IES NG",
      query: "AGENTS",
    });
    expect(isT3TeamComposerPathSearchTargetQueryable(target)).toBe(true);
  });

  it("keeps the environment but drops cwd/query for non-path triggers", () => {
    const target = resolveT3TeamComposerPathSearchTarget(skillTrigger, {
      environmentId,
      cwd: "/workspace",
    });

    expect(target).toEqual({ environmentId, cwd: null, query: null });
    expect(isT3TeamComposerPathSearchTargetQueryable(target)).toBe(false);
  });

  it("reports a missing cwd as not queryable (the kickoff `@` regression)", () => {
    const target = resolveT3TeamComposerPathSearchTarget(pathTrigger, {
      environmentId,
      cwd: null,
    });

    expect(target).toEqual({ environmentId, cwd: null, query: "AGENTS" });
    expect(isT3TeamComposerPathSearchTargetQueryable(target)).toBe(false);
  });

  it("reports a missing environment as not queryable", () => {
    const target = resolveT3TeamComposerPathSearchTarget(pathTrigger, {
      environmentId: null,
      cwd: "/workspace",
    });

    expect(isT3TeamComposerPathSearchTargetQueryable(target)).toBe(false);
  });

  it("treats a bare `@` (empty query) as not queryable, matching the chat composer", () => {
    const target = resolveT3TeamComposerPathSearchTarget(
      { ...pathTrigger, query: "" },
      { environmentId, cwd: "/workspace" },
    );

    expect(target.query).toBe("");
    expect(isT3TeamComposerPathSearchTargetQueryable(target)).toBe(false);
  });

  it("returns an inert target when there is no trigger", () => {
    const target = resolveT3TeamComposerPathSearchTarget(null, {
      environmentId,
      cwd: "/workspace",
    });

    expect(target).toEqual({ environmentId, cwd: null, query: null });
  });
});
