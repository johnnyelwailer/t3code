// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const { mockUseProjects } = vi.hoisted(() => ({ mockUseProjects: vi.fn() }));

vi.mock("~/state/entities", () => ({
  useProjects: () => mockUseProjects(),
}));

import { useExistingProjectForExternalProject } from "./t3team-useExistingProjectForExternalProject";

type HookInput = Parameters<typeof useExistingProjectForExternalProject>[0];
type HookValue = ReturnType<typeof useExistingProjectForExternalProject>;

function renderHookValue(input: HookInput): HookValue {
  let captured: HookValue | undefined;

  function Probe() {
    captured = useExistingProjectForExternalProject(input);
    return null;
  }

  renderToStaticMarkup(createElement(Probe));
  if (!captured) {
    throw new Error("Expected hook value to be captured.");
  }
  return captured;
}

describe("useExistingProjectForExternalProject", () => {
  it("flags an already-added external id", () => {
    mockUseProjects.mockReturnValue([
      {
        id: "proj-1",
        title: "Nexi AI",
        environmentId: "env-1",
        source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1" },
      },
    ]);

    const result = renderHookValue({ accountId: "acct-1", externalProjectIds: ["ext-1", "ext-2"] });

    expect(result.get("ext-1")).toEqual({ projectId: "proj-1", title: "Nexi AI" });
    expect(result.has("ext-2")).toBe(false);
  });

  it("ignores a project bound to a different account", () => {
    mockUseProjects.mockReturnValue([
      {
        id: "proj-1",
        title: "Nexi AI",
        environmentId: "env-1",
        source: { provider: "atlassian", accountId: "other-acct", externalProjectId: "ext-1" },
      },
    ]);

    const result = renderHookValue({ accountId: "acct-1", externalProjectIds: ["ext-1"] });

    expect(result.size).toBe(0);
  });

  it("ignores a local project", () => {
    mockUseProjects.mockReturnValue([
      {
        id: "proj-1",
        title: "Local workspace",
        environmentId: "env-1",
        source: { provider: "local" },
      },
    ]);

    const result = renderHookValue({ accountId: "acct-1", externalProjectIds: ["ext-1"] });

    expect(result.size).toBe(0);
  });

  it("returns empty when there is no account selected yet", () => {
    mockUseProjects.mockReturnValue([
      {
        id: "proj-1",
        title: "Nexi AI",
        environmentId: "env-1",
        source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "ext-1" },
      },
    ]);

    const result = renderHookValue({ accountId: null, externalProjectIds: ["ext-1"] });

    expect(result.size).toBe(0);
  });
});
