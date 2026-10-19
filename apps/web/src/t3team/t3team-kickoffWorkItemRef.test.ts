import { describe, expect, it } from "vite-plus/test";

import { ProjectShellProjectId, type ProjectShellProject } from "@t3tools/project-context";

import {
  buildT3TeamKickoffWorkItemParameters,
  buildT3TeamKickoffWorkItemRef,
  type T3TeamKickoffWorkItemRef,
} from "~/t3team/t3team-kickoffWorkItemRef";

const project: ProjectShellProject = {
  id: ProjectShellProjectId.make("project-alpha"),
  title: "Alpha",
  source: { provider: "atlassian" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("buildT3TeamKickoffWorkItemRef", () => {
  it("builds a reference for an explicitly selected ticket", () => {
    const ref = buildT3TeamKickoffWorkItemRef({
      resourceKind: "ticket",
      selectedWorkLabel: "PRJ-1",
      project,
    });
    expect(ref).toEqual({ key: "PRJ-1", provider: "atlassian", project: "project-alpha" });
  });

  it("returns undefined when the surface is not a ticket", () => {
    expect(
      buildT3TeamKickoffWorkItemRef({
        resourceKind: undefined,
        selectedWorkLabel: "Alpha",
        project,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when the selected label is blank", () => {
    expect(
      buildT3TeamKickoffWorkItemRef({
        resourceKind: "ticket",
        selectedWorkLabel: "   ",
        project,
      }),
    ).toBeUndefined();
  });

  it("trims the key", () => {
    const ref = buildT3TeamKickoffWorkItemRef({
      resourceKind: "ticket",
      selectedWorkLabel: "  PRJ-1  ",
      project,
    });
    expect(ref?.key).toBe("PRJ-1");
  });
});

describe("buildT3TeamKickoffWorkItemParameters", () => {
  it("contributes issueIdOrKey and the workItem reference", () => {
    const workItem: T3TeamKickoffWorkItemRef = {
      key: "PRJ-1",
      provider: "atlassian",
      project: "project-alpha",
    };
    expect(buildT3TeamKickoffWorkItemParameters(workItem)).toEqual({
      issueIdOrKey: "PRJ-1",
      workItem: { key: "PRJ-1", provider: "atlassian", project: "project-alpha" },
    });
  });

  it("contributes nothing when there is no work item", () => {
    expect(buildT3TeamKickoffWorkItemParameters(undefined)).toEqual({});
  });
});
