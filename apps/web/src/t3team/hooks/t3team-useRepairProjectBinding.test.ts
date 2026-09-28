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
vi.mock("~/t3team/t3team-environmentCommands", () => ({
  runT3TeamEnvironmentCommand: vi.fn(async () => undefined),
  primaryEnvironmentIdOrThrow: () => "primary-env",
}));
vi.mock("~/state/projects", () => ({
  projectEnvironment: { update: { label: "project:update" } },
}));

import { projectEnvironment } from "~/state/projects";
import { runT3TeamEnvironmentCommand } from "~/t3team/t3team-environmentCommands";
import { useRepairProjectBinding } from "./t3team-useRepairProjectBinding";

const runCommand = vi.mocked(runT3TeamEnvironmentCommand);

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

describe("useRepairProjectBinding", () => {
  beforeEach(() => {
    runCommand.mockReset();
    runCommand.mockResolvedValue(undefined);
    const baseBackend = createMockBackend();
    backendRef.current = {
      ...baseBackend,
      atlassian: {
        ...baseBackend.atlassian,
        listAccounts: vi.fn().mockResolvedValue([]),
        listProjects: vi.fn().mockResolvedValue([iesSandbox]),
      },
    };
  });

  it("dispatches nothing until confirmed, then sends the exact expected source", async () => {
    const rendered = renderRepair(brokenProject);

    // Let the (empty) bootstrap account load settle before touching anything.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(runCommand).not.toHaveBeenCalled();

    act(() => {
      rendered.value().setSelectedAccount(account);
    });
    // Populates `projects` so `setSelectedProject` (which resolves by id against that list) can
    // find the row below.
    await act(async () => {
      await rendered.value().loadProjects(account);
    });
    act(() => {
      rendered.value().setSelectedProject(iesSandbox);
    });
    expect(runCommand).not.toHaveBeenCalled();

    const result: { current: ProjectShellProject | null } = { current: null };
    await act(async () => {
      result.current = await rendered.value().confirmRepair();
    });

    expect(runCommand).toHaveBeenCalledTimes(1);
    const [sent, request] = runCommand.mock.calls[0]!;
    // Work-project bindings live on this machine.
    expect(sent).toBe(projectEnvironment.update);
    expect((request as { environmentId: string }).environmentId).toBe("primary-env");
    const command = (request as { input: Record<string, unknown> }).input;
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

  it("surfaces a duplicate-binding failure without silently updating the stored project", async () => {
    runCommand.mockRejectedValue(
      new Error(
        "Orchestration command invariant failed (project.meta.update): externalProjectId is already bound to project 'other-project'",
      ),
    );
    const rendered = renderRepair(brokenProject);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      rendered.value().setSelectedAccount(account);
    });
    await act(async () => {
      await rendered.value().loadProjects(account);
    });
    act(() => {
      rendered.value().setSelectedProject(iesSandbox);
    });

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
