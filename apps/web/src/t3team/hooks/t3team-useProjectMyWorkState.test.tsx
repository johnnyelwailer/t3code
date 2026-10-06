/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamMyWorkPage, T3TeamPollResult } from "~/t3team/backend/t3team-pollingBackend";
import { resolveProjectMyWorkContentState } from "~/t3team/t3team-projectMyWorkContentState";

import { useProjectMyWorkState } from "./t3team-useProjectMyWorkState";

// The real hook mirrors state into the router search params; this test is about
// the data flow, so swap in plain React state and skip the router.
vi.mock("~/t3team/t3team-projectDashboardMyWorkState", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/t3team/t3team-projectDashboardMyWorkState")>();
  const { useState } = await import("react");
  return {
    ...actual,
    useProjectDashboardMyWorkState: () => {
      const [state, setState] = useState(actual.createDefaultProjectDashboardMyWorkState());
      return { state, setState };
    },
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SITE_ID = "db095f0c-3377-4104-b059-e52c59babbfa";
const VIEWER_ID = "61a69214ef18ca00717bb3da";

const project = {
  id: "project-nxai" as ProjectShellProject["id"],
  title: "Nexi AI",
  source: { provider: "atlassian", accountId: SITE_ID, externalProjectId: "11816", raw: {} },
  workspace: { rootPath: "/tmp/nxai", createdAt: "2026-05-21T18:30:35.000Z" },
  createdAt: "2026-05-21T18:30:35.000Z",
  updatedAt: "2026-05-21T18:30:35.000Z",
} as ProjectShellProject;

// What the server returns for the viewer: their assigned story + its epic as parent context.
const myWorkPage: T3TeamMyWorkPage = {
  viewerAccountId: VIEWER_ID,
  totalCount: 2,
  items: [
    {
      provider: "atlassian",
      kind: "issue",
      id: "NXAI-6",
      displayId: "NXAI-6",
      title: "Rollendefinitionen",
      status: "Open",
      type: "Epic",
    },
    {
      provider: "atlassian",
      kind: "issue",
      id: "NXAI-8",
      displayId: "NXAI-8",
      title: "Dev-Rolle",
      status: "in Analysis",
      type: "Story",
      parentId: "NXAI-6",
      assignee: "Someone With A Different Display Name",
      assigneeAccountId: VIEWER_ID,
    },
  ],
} as unknown as T3TeamMyWorkPage;

function createBackend(overrides: {
  pollMyWork: () => Promise<T3TeamPollResult<T3TeamMyWorkPage>>;
  listAccounts?: () => Promise<unknown>;
}): BackendApi {
  return {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: async () => undefined,
    disconnect: async () => undefined,
    atlassian: {
      pollMyWork: overrides.pollMyWork,
      listAccounts: overrides.listAccounts ?? (async () => []),
      getBoardColumns: async () => ({ boardColumns: [], availableStatuses: [] }),
    } as unknown as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {} as BackendApi["projectWorkspace"],
  } as unknown as BackendApi;
}

describe("useProjectMyWorkState data flow", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const latest: { result: ReturnType<typeof useProjectMyWorkState> | null } = { result: null };

  function Harness() {
    latest.result = useProjectMyWorkState({ project, fallbackTickets: [] });
    return null;
  }

  async function mount(backend: BackendApi) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <BackendProvider backend={backend}>
          <Harness />
        </BackendProvider>,
      );
    });
  }

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    latest.result = null;
    window.localStorage.clear();
  });

  it("shows the viewer's assigned work even when their display name cannot be resolved", async () => {
    // Regression: identity used the Jira *site* id (project.source.accountId) as the
    // user's accountId, so rows only matched via a display name fetched from the
    // slowest/least reliable endpoint. If that lookup failed the board was blank.
    await mount(
      createBackend({
        pollMyWork: async () => ({ unchanged: false, fingerprint: "sha256:a", value: myWorkPage }),
        listAccounts: async () => {
          throw new Error("listAccounts failed");
        },
      }),
    );

    await vi.waitFor(() => {
      expect(latest.result?.assignedWorkItems.map((ticket) => ticket.id)).toEqual(["NXAI-8"]);
    });
    expect(latest.result?.filteredWorkItems.map((ticket) => ticket.id)).toEqual(["NXAI-8"]);
    expect(latest.result?.loading).toBe(false);
    expect(latest.result?.loadStatus.loadError).toBeNull();
  });

  it("reports loading, not empty, until the first My Work response arrives", async () => {
    let release: ((value: T3TeamPollResult<T3TeamMyWorkPage>) => void) | undefined;
    await mount(
      createBackend({
        pollMyWork: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
    );

    // Before the first poll has even been scheduled (and while it is in flight)
    // the board must not claim "nothing is assigned to you".
    expect(latest.result?.loading).toBe(true);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(latest.result?.loading).toBe(true);

    await act(async () => {
      release?.({ unchanged: false, fingerprint: "sha256:a", value: myWorkPage });
    });
    await vi.waitFor(() => expect(latest.result?.loading).toBe(false));
    expect(latest.result?.assignedWorkItems).toHaveLength(1);
  });

  it("surfaces a failed My Work fetch as an error instead of an empty board", async () => {
    await mount(
      createBackend({
        pollMyWork: async () => {
          throw new Error("Jira request failed (503)");
        },
      }),
    );

    await vi.waitFor(() => {
      expect(latest.result?.loadStatus.loadError).toBe("Jira request failed (503)");
    });
    expect(latest.result?.loading).toBe(false);
    expect(
      resolveProjectMyWorkContentState({
        loading: latest.result?.loading ?? false,
        assignedWorkItemsCount: latest.result?.assignedWorkItems.length ?? 0,
        filteredWorkItemsCount: latest.result?.filteredWorkItems.length ?? 0,
        ...latest.result?.loadStatus,
      }),
    ).toEqual({ kind: "error", message: "Jira request failed (503)" });
  });
});
