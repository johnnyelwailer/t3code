/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3work/backend/t3work-BackendContext";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3workPollResult } from "~/t3work/backend/t3work-pollingBackend";

import { useProjectMyWork } from "./t3work-useProjectMyWork";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createProject(overrides: {
  readonly id: string;
  readonly externalProjectId: string;
}): ProjectShellProject {
  return {
    id: overrides.id as ProjectShellProject["id"],
    title: `Project ${overrides.id}`,
    source: {
      provider: "atlassian",
      accountId: `acct-${overrides.id}`,
      externalProjectId: overrides.externalProjectId,
      raw: {},
    },
    workspace: {
      rootPath: `/tmp/${overrides.id}`,
      createdAt: "2026-05-21T18:30:35.000Z",
    },
    createdAt: "2026-05-21T18:30:35.000Z",
    updatedAt: "2026-05-21T18:30:35.000Z",
  } as ProjectShellProject;
}

function createResourcePage(label: string): ResourcePage {
  return {
    items: [
      {
        provider: "atlassian",
        kind: "issue",
        id: label,
        displayId: label,
        title: label,
        url: `https://example.test/browse/${label}`,
        projectId: label,
        status: "To Do",
        type: "Task",
      },
    ],
    totalCount: 1,
  } as ResourcePage;
}

describe("useProjectMyWork stale-response race", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
  });

  it("does not let a slow in-flight load for the old project clobber the new project's state", async () => {
    const projectA = createProject({ id: "project-a", externalProjectId: "A-1" });
    const projectB = createProject({ id: "project-b", externalProjectId: "B-1" });

    let resolveA: ((result: T3workPollResult<ResourcePage>) => void) | undefined;
    const pageA = createResourcePage("A-ISSUE");
    const pageB = createResourcePage("B-ISSUE");

    const pollMyWork = async (input: {
      readonly externalProjectId: string;
    }): Promise<T3workPollResult<ResourcePage>> => {
      if (input.externalProjectId === "A-1") {
        // Never resolves on its own; the test resolves it explicitly after
        // switching to project B, simulating a slow/late response.
        return new Promise<T3workPollResult<ResourcePage>>((resolve) => {
          resolveA = resolve;
        });
      }
      return { unchanged: false, fingerprint: "sha256:b", value: pageB };
    };

    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      dispatchCommand: async () => undefined,
      launchRecipeWorkflow: async () => ({ ok: true }),
      submitRecipeCardAction: async () => ({ ok: true }),
      resolveWorkflowInput: async () => undefined,
      listThreadPlacements: async () => [],
      syncThreadToolContext: async () => undefined,
      atlassian: { pollMyWork } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;

    const latest: { result: ReturnType<typeof useProjectMyWork> | null } = { result: null };

    function Harness({ project }: { project: ProjectShellProject }) {
      latest.result = useProjectMyWork(project);
      return null;
    }

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    // Mount with project A; this kicks off the in-flight (never-resolving-yet) load.
    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <Harness project={projectA} />
        </BackendProvider>,
      );
    });

    // The polling controller schedules its initial poll via a real
    // setTimeout(0); wait for it to fire and for load() to reach the await.
    await vi.waitFor(() => {
      expect(resolveA).toBeDefined();
    });
    expect(latest.result?.loading).toBe(true);

    // Switch to project B before A's load resolves.
    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <Harness project={projectB} />
        </BackendProvider>,
      );
    });

    // Wait for B's load to complete.
    await vi.waitFor(() => {
      expect(latest.result?.resources?.items[0]?.id).toBe("B-ISSUE");
    });
    expect(latest.result?.loading).toBe(false);
    expect(latest.result?.error).toBeNull();

    // Now resolve the stale project-A load. It must not clobber B's state.
    await act(async () => {
      resolveA?.({ unchanged: false, fingerprint: "sha256:a", value: pageA });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.result?.resources?.items[0]?.id).toBe("B-ISSUE");
    expect(latest.result?.loading).toBe(false);
    expect(latest.result?.error).toBeNull();
  });
});
