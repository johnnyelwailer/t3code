// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import { createMockBackend } from "../backend/t3team-mockBackend";
import type { BackendApi } from "../backend/t3team-types";

const backendRef: { current: BackendApi | null } = { current: null };

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => backendRef.current,
}));
vi.mock("~/t3team/backend/t3team-BackendContext", () => ({
  useBackend: () => backendRef.current,
}));

import { useRepairProjectBinding } from "./t3team-useRepairProjectBinding";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useRepairProjectBinding>;

const account: IntegrationAccount = { id: "acct-1", provider: "atlassian", label: "Acme Co" };
const iesSandbox: ExternalProject = {
  id: "2",
  provider: "atlassian",
  title: "IES - Sandbox (Scrum)",
  key: "IES",
};

const brokenProject: ProjectShellProject = {
  id: "proj-1" as ProjectShellProject["id"],
  title: "IES - Sandbox (Scrum)",
  source: { provider: "atlassian" },
  workspace: { rootPath: "/tmp/proj-1", createdAt: "2026-01-01T00:00:00.000Z" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderRepair(project: ProjectShellProject) {
  const captured: { current: HookValue | null } = { current: null };

  function Probe() {
    captured.current = useRepairProjectBinding(project);
    return null;
  }

  const host = document.createElement("div");
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(Probe));
  });

  return {
    value: (): HookValue => {
      if (!captured.current) throw new Error("Expected the repair hook to render.");
      return captured.current;
    },
    unmount: () => act(() => root.unmount()),
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useRepairProjectBinding", () => {
  let updateProjectSource: ReturnType<
    typeof vi.fn<BackendApi["orchestration"]["updateProjectSource"]>
  >;

  beforeEach(() => {
    updateProjectSource = vi
      .fn<BackendApi["orchestration"]["updateProjectSource"]>()
      .mockResolvedValue(undefined);
    const baseBackend = createMockBackend();
    backendRef.current = {
      ...baseBackend,
      orchestration: { ...baseBackend.orchestration, updateProjectSource },
      atlassian: {
        ...baseBackend.atlassian,
        listAccounts: vi.fn().mockResolvedValue([account]),
        listProjects: vi.fn().mockResolvedValue([iesSandbox]),
      },
    };
  });

  it("dispatches nothing until confirmed, then sends the exact expected source", async () => {
    const rendered = renderRepair(brokenProject);
    await settle();
    expect(rendered.value().catalogState.catalog.map((entry) => entry.entryKey)).toEqual([
      "acct-1::2",
    ]);

    act(() => rendered.value().select("acct-1::2"));
    expect(updateProjectSource).not.toHaveBeenCalled();

    const result: { current: ProjectShellProject | null } = { current: null };
    await act(async () => {
      result.current = await rendered.value().confirmRepair();
    });

    expect(updateProjectSource).toHaveBeenCalledTimes(1);
    const [command] = updateProjectSource.mock.calls[0]!;
    expect(command.projectId).toBe("proj-1");
    expect(command.source).toEqual({
      provider: "atlassian",
      accountId: "acct-1",
      externalProjectId: "2",
      externalProjectKey: "IES",
    });
    expect(result.current?.source).toEqual(command.source);

    rendered.unmount();
  });

  it("pre-selects the project the stored binding still points at, but never confirms for the user", async () => {
    const rendered = renderRepair({
      ...brokenProject,
      source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "2" },
    });
    await settle();

    expect(rendered.value().selectedKey).toBe("acct-1::2");
    expect(updateProjectSource).not.toHaveBeenCalled();

    rendered.unmount();
  });

  it("cannot confirm before a project is chosen", async () => {
    const rendered = renderRepair(brokenProject);
    await settle();

    let repaired: ProjectShellProject | null | undefined;
    await act(async () => {
      repaired = await rendered.value().confirmRepair();
    });

    expect(repaired).toBeNull();
    expect(updateProjectSource).not.toHaveBeenCalled();

    rendered.unmount();
  });

  it("surfaces a duplicate-binding failure without silently updating the stored project", async () => {
    updateProjectSource.mockRejectedValue(
      new Error(
        "Orchestration command invariant failed (project.meta.update): externalProjectId is already bound to project 'other-project'",
      ),
    );
    const rendered = renderRepair(brokenProject);
    await settle();
    act(() => rendered.value().select("acct-1::2"));

    let repaired: ProjectShellProject | null = null;
    await act(async () => {
      repaired = await rendered.value().confirmRepair();
    });

    expect(repaired).toBeNull();
    expect(rendered.value().confirmError).toBe(
      "That Jira project is already bound to another project in this workspace.",
    );

    rendered.unmount();
  });
});
