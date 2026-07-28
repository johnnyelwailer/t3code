import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { OrchestrationProject, ProjectSourceBinding } from "./orchestration.ts";

const decodeBinding = Schema.decodeUnknownSync(ProjectSourceBinding);
const decodeProject = Schema.decodeUnknownSync(OrchestrationProject);

const baseProject = {
  id: "project-1",
  title: "Demo",
  workspaceRoot: "/tmp/demo",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

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

  it("decodes a project with an absent `source` (replay-compat guarantee)", () => {
    const decoded = decodeProject(baseProject);
    expect(decoded.source).toBeUndefined();
  });
});
