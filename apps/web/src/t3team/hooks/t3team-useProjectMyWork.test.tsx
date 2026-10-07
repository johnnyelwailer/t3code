/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamPollResult } from "~/t3team/backend/t3team-pollingBackend";

import { useProjectMyWork } from "./t3team-useProjectMyWork";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";

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

    let resolveA: ((result: T3TeamPollResult<ResourcePage>) => void) | undefined;
    const pageA = createResourcePage("A-ISSUE");
    const pageB = createResourcePage("B-ISSUE");

    const pollMyWork = async (input: {
      readonly externalProjectId: string;
    }): Promise<T3TeamPollResult<ResourcePage>> => {
      if (input.externalProjectId === "A-1") {
        // Never resolves on its own; the test resolves it explicitly after
        // switching to project B, simulating a slow/late response.
        return new Promise<T3TeamPollResult<ResourcePage>>((resolve) => {
          resolveA = resolve;
        });
      }
      return { unchanged: false, fingerprint: "sha256:b", value: pageB };
    };

    const backend = {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      orchestration: createRecordingOrchestrationApi(),
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

describe("useProjectMyWork load/error bookkeeping", () => {
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

  function createBackend(
    pollMyWork: (input: { externalProjectId: string }) => Promise<T3TeamPollResult<ResourcePage>>,
  ): BackendApi {
    return {
      state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
      connect: async () => undefined,
      disconnect: async () => undefined,
      atlassian: { pollMyWork } as unknown as BackendApi["atlassian"],
      github: {} as BackendApi["github"],
      projectWorkspace: {} as BackendApi["projectWorkspace"],
    } as unknown as BackendApi;
  }

  async function mount(backend: BackendApi, project: ProjectShellProject) {
    const latest: { result: ReturnType<typeof useProjectMyWork> | null } = { result: null };
    function Harness({ current }: { current: ProjectShellProject }) {
      latest.result = useProjectMyWork(current);
      return null;
    }
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const render = async (current: ProjectShellProject) => {
      await act(async () => {
        root?.render(
          <BackendProvider backend={backend}>
            <Harness current={current} />
          </BackendProvider>,
        );
      });
    };
    await render(project);
    return { latest, render };
  }

  it("does not stay 'loading' after switching to a project with no Jira link mid-fetch", async () => {
    const linked = createProject({ id: "project-linked", externalProjectId: "L-1" });
    const unlinked = {
      ...createProject({ id: "project-unlinked", externalProjectId: "" }),
      source: { provider: "atlassian", raw: {} },
    } as unknown as ProjectShellProject;
    const backend = createBackend(() => new Promise(() => undefined));

    const { latest, render } = await mount(backend, linked);
    await vi.waitFor(() => expect(latest.result?.loading).toBe(true));

    await render(unlinked);

    expect(latest.result?.isLinked).toBe(false);
    expect(latest.result?.loading).toBe(false);
  });

  it("keeps a failed load as an error until a poll succeeds", async () => {
    const project = createProject({ id: "project-flaky", externalProjectId: "F-1" });
    let attempts = 0;
    const backend = createBackend(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Jira request failed (503)");
      return { unchanged: false, fingerprint: "sha256:ok", value: createResourcePage("F-ISSUE") };
    });

    const { latest } = await mount(backend, project);
    await vi.waitFor(() => expect(latest.result?.error).toBe("Jira request failed (503)"));

    await act(async () => {
      await latest.result?.reload();
    });

    expect(latest.result?.error).toBeNull();
    expect(latest.result?.resources?.items[0]?.id).toBe("F-ISSUE");
  });

  it("ignores an older request's failure that lands after a newer request succeeded", async () => {
    const project = createProject({ id: "project-overlap", externalProjectId: "O-1" });
    const rejectors: Array<(error: Error) => void> = [];
    let call = 0;
    const backend = createBackend(() => {
      call += 1;
      if (call === 1) {
        return new Promise((_resolve, reject) => rejectors.push(reject));
      }
      return Promise.resolve({
        unchanged: false as const,
        fingerprint: "sha256:new",
        value: createResourcePage("O-ISSUE"),
      });
    });

    const { latest } = await mount(backend, project);
    await vi.waitFor(() => expect(rejectors).toHaveLength(1));

    // A card-move reload overlaps the still-pending poll and succeeds first.
    await act(async () => {
      await latest.result?.reload();
    });
    expect(latest.result?.resources?.items[0]?.id).toBe("O-ISSUE");

    await act(async () => {
      rejectors[0]?.(new Error("old poll failed"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.result?.error).toBeNull();
  });
});
