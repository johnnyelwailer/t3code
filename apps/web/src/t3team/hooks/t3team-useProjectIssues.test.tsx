/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject, ResourcePage } from "@t3tools/project-context";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider } from "~/t3team/backend/t3team-BackendContext";
import type { T3TeamProjectIssuesResult } from "~/t3team/backend/t3team-projectIssuesBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";

import { useProjectIssues } from "./t3team-useProjectIssues";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createProject(): ProjectShellProject {
  return {
    id: "project-a" as ProjectShellProject["id"],
    title: "Project A",
    source: {
      provider: "atlassian",
      accountId: "acct-a",
      externalProjectId: "11816",
      raw: {},
    },
    createdAt: "2026-05-21T18:30:35.000Z",
    updatedAt: "2026-05-21T18:30:35.000Z",
  } as ProjectShellProject;
}

function createResourcePage(keys: ReadonlyArray<string>): ResourcePage {
  return {
    items: keys.map((key) => ({
      provider: "atlassian",
      kind: "issue",
      id: key,
      displayId: key,
      title: key,
      url: `https://example.test/browse/${key}`,
      projectId: "11816",
      status: "To Do",
      type: "Task",
    })),
    totalCount: keys.length,
  } as ResourcePage;
}

function createBackend(listProjectIssues: () => Promise<T3TeamProjectIssuesResult>): BackendApi {
  return {
    state: { connectionStatus: "connected", serverConfig: null, providers: [], error: null },
    connect: async () => undefined,
    disconnect: async () => undefined,
    dispatchCommand: async () => undefined,
    launchRecipeWorkflow: async () => ({ ok: true }),
    submitRecipeCardAction: async () => ({ ok: true }),
    resolveWorkflowInput: async () => undefined,
    listThreadPlacements: async () => [],
    syncThreadToolContext: async () => undefined,
    atlassian: { listProjectIssues } as unknown as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {} as BackendApi["projectWorkspace"],
  } as unknown as BackendApi;
}

/** jsdom reports "visible" by default; force the backgrounded-tab case. */
function setVisibility(value: DocumentVisibilityState): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
  return () => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    if (descriptor) Object.defineProperty(Document.prototype, "visibilityState", descriptor);
  };
}

describe("useProjectIssues", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let restoreVisibility: (() => void) | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
    restoreVisibility?.();
    restoreVisibility = null;
  });

  async function mount(backend: BackendApi) {
    const latest: { result: ReturnType<typeof useProjectIssues> | null } = { result: null };
    function Harness() {
      latest.result = useProjectIssues(createProject());
      return null;
    }
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
    return latest;
  }

  /**
   * The regression. `startBrowserPolling` refuses to schedule while the tab is
   * hidden, so routing the FIRST fetch through the poller left a work item
   * detail view opened in a background tab with zero project tickets forever —
   * and therefore zero children, since `childFromProject` matches on
   * `parentId` against exactly this list.
   */
  it("loads on mount even when the tab is hidden, so the poller's visibility gate cannot starve first paint", async () => {
    restoreVisibility = setVisibility("hidden");
    const listProjectIssues = vi.fn(
      async (): Promise<T3TeamProjectIssuesResult> => ({
        page: createResourcePage(["NXAI-6", "NXAI-8"]),
        source: "mirror",
      }),
    );

    const latest = await mount(createBackend(listProjectIssues));

    await vi.waitFor(() => {
      expect(latest.result?.tickets.length).toBe(2);
    });
    expect(listProjectIssues).toHaveBeenCalled();
  });

  it("keeps the derived ticket array identity stable across an unchanged re-read", async () => {
    // A fresh page object each call — the hook must diff on content, not identity.
    const listProjectIssues = async (): Promise<T3TeamProjectIssuesResult> => ({
      page: createResourcePage(["NXAI-6"]),
      source: "mirror",
    });

    const latest = await mount(createBackend(listProjectIssues));
    await vi.waitFor(() => {
      expect(latest.result?.tickets.length).toBe(1);
    });
    const first = latest.result?.tickets;

    await act(async () => {
      await latest.result?.reload();
    });

    expect(latest.result?.tickets).toBe(first);
  });

  /**
   * A `live-fallback` response is the viewer's own issues standing in while the
   * server mirror backfills. Settling on it would show a work item missing most
   * of its children until the next 90 s poll.
   */
  it("re-asks quickly while the server reports a cold mirror, and stops once it answers", async () => {
    restoreVisibility = setVisibility("hidden");
    let call = 0;
    const listProjectIssues = vi.fn(async (): Promise<T3TeamProjectIssuesResult> => {
      call += 1;
      return call === 1
        ? { page: createResourcePage(["NXAI-8"]), source: "live-fallback" }
        : { page: createResourcePage(["NXAI-6", "NXAI-8", "NXAI-9"]), source: "mirror" };
    });

    const latest = await mount(createBackend(listProjectIssues));

    await vi.waitFor(() => {
      expect(latest.result?.tickets.length).toBe(1);
    });

    await vi.waitFor(
      () => {
        expect(latest.result?.tickets.length).toBe(3);
      },
      { timeout: 10_000 },
    );

    const callsAfterMirror = listProjectIssues.mock.calls.length;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });
    // No further retries once the mirror answered.
    expect(listProjectIssues.mock.calls.length).toBe(callsAfterMirror);
  }, 20_000);
});
