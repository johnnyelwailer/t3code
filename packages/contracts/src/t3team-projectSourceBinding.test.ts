import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { OrchestrationProjectShell } from "./orchestrationProject.ts";
import { ProjectMutation } from "./project.ts";
import { ProjectSourceBinding } from "./t3team-orchestrationExt.ts";

const decodeBinding = Schema.decodeUnknownSync(ProjectSourceBinding);

describe("ProjectSourceBinding", () => {
  it("fails to decode a non-local provider with no ids", () => {
    expect(() => decodeBinding({ provider: "atlassian" })).toThrow();
  });

  it("decodes a complete non-local binding", () => {
    const decoded = decodeBinding({
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "ext-1",
      externalProjectKey: "ENG",
    });
    expect(decoded).toEqual({
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "ext-1",
      externalProjectKey: "ENG",
    });
  });

  it("decodes a `local` binding with no ids", () => {
    expect(decodeBinding({ provider: "local" })).toEqual({ provider: "local" });
  });
});

const shellBase = {
  id: "project-1",
  title: "Project",
  workspaceRoot: "/repo",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const binding = { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1" };

describe("source on project shells and mutations", () => {
  it("a shell decodes with and without a binding (absent = none, never defaulted)", () => {
    const decodeShell = Schema.decodeUnknownSync(OrchestrationProjectShell);
    expect(decodeShell({ ...shellBase, source: binding }).source).toEqual(binding);
    expect("source" in decodeShell(shellBase)).toBe(false);
  });

  it("create/update mutations carry the binding; a broken binding is rejected", () => {
    const decodeMutation = Schema.decodeUnknownSync(ProjectMutation);
    const update = decodeMutation({
      type: "project.update",
      commandId: "cmd-1",
      projectId: "project-1",
      source: binding,
    });
    expect(update.type === "project.update" ? update.source : undefined).toEqual(binding);
    expect(() =>
      decodeMutation({
        type: "project.create",
        commandId: "cmd-2",
        projectId: "project-2",
        title: "P",
        workspaceRoot: "/repo",
        source: { provider: "atlassian" },
      }),
    ).toThrow();
  });
});
