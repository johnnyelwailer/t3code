import { describe, expect, it } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";
import type { Project } from "~/types";
import {
  projectBindingState,
  reconcileStoredProjectSource,
  toProjectSource,
  toSourceBindingCommand,
} from "~/t3team/t3team-projectSourceBinding";

function stored(source: ProjectShellProject["source"]): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
  };
}

function live(source: Project["source"]): Project {
  return {
    id: "project-alpha" as Project["id"],
    title: "Project Alpha",
    workspaceRoot: "/tmp/project-alpha",
    repositoryIdentity: undefined,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    source,
    environmentId: "env-1" as Project["environmentId"],
  } as Project;
}

describe("projectBindingState", () => {
  it("classifies local", () => {
    expect(projectBindingState({ provider: "local" })).toBe("local");
  });

  it("classifies a complete non-local binding as bound", () => {
    expect(
      projectBindingState({
        provider: "atlassian",
        accountId: "acc-1",
        externalProjectId: "10001",
      }),
    ).toBe("bound");
  });

  it("classifies a non-local binding missing ids as needs-repair", () => {
    expect(projectBindingState({ provider: "atlassian" })).toBe("needs-repair");
    expect(projectBindingState({ provider: "atlassian", accountId: "acc-1" })).toBe("needs-repair");
  });
});

describe("toProjectSource", () => {
  it("returns null when the server sent no binding", () => {
    expect(toProjectSource(undefined)).toBeNull();
  });

  it("decodes a local binding", () => {
    expect(toProjectSource({ provider: "local" })).toEqual({ provider: "local" });
  });

  it("decodes a non-local binding, omitting absent optional keys", () => {
    expect(
      toProjectSource({ provider: "atlassian", accountId: "acc-1", externalProjectId: "10001" }),
    ).toEqual({ provider: "atlassian", accountId: "acc-1", externalProjectId: "10001" });
  });

  it("decodes optional externalProjectKey/Url when present", () => {
    expect(
      toProjectSource({
        provider: "atlassian",
        accountId: "acc-1",
        externalProjectId: "10001",
        externalProjectKey: "INT",
        externalProjectUrl: "https://example.atlassian.net/browse/INT",
      }),
    ).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
      externalProjectKey: "INT",
      externalProjectUrl: "https://example.atlassian.net/browse/INT",
    });
  });
});

describe("toSourceBindingCommand", () => {
  it("encodes local as-is", () => {
    expect(toSourceBindingCommand({ provider: "local" })).toEqual({ provider: "local" });
  });

  it("encodes a complete work-project source", () => {
    expect(
      toSourceBindingCommand({
        provider: "atlassian",
        accountId: "acc-1",
        externalProjectId: "10001",
        externalProjectKey: "INT",
      }),
    ).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
      externalProjectKey: "INT",
    });
  });

  it("degrades an incomplete non-local source to local rather than sending a broken union member", () => {
    expect(toSourceBindingCommand({ provider: "atlassian" })).toEqual({ provider: "local" });
  });
});

describe("reconcileStoredProjectSource", () => {
  it("server binding present -> server wins", () => {
    const result = reconcileStoredProjectSource(
      stored({ provider: "local" }),
      live({ provider: "atlassian", accountId: "acc-1", externalProjectId: "10001" }),
    );
    expect(result.source).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
    });
  });

  it("server absent but stored already bound -> keeps the stored binding", () => {
    const storedProject = stored({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
    });
    const result = reconcileStoredProjectSource(storedProject, live(undefined));
    expect(result.source).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
    });
  });

  it("neither has a binding -> honest local with no fabricated ids", () => {
    const result = reconcileStoredProjectSource(stored({ provider: "local" }), live(undefined));
    expect(result.source).toEqual({ provider: "local" });
  });

  it("strips a previously-fabricated local binding when the server still has none", () => {
    const storedProject = stored({
      provider: "local",
      externalProjectId: "project-alpha",
      externalProjectKey: "Project Alpha",
    });
    const result = reconcileStoredProjectSource(storedProject, live(undefined));
    expect(result.source).toEqual({ provider: "local" });
  });

  it("preserves client-only raw metadata across reconciliation", () => {
    const storedProject = stored({ provider: "local", raw: { environmentId: "env-1" } });
    const result = reconcileStoredProjectSource(
      storedProject,
      live({ provider: "atlassian", accountId: "acc-1", externalProjectId: "10001" }),
    );
    expect(result.source).toEqual({
      provider: "atlassian",
      accountId: "acc-1",
      externalProjectId: "10001",
      raw: { environmentId: "env-1" },
    });
  });
});
