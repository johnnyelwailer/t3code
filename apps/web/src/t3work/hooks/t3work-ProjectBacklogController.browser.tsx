/* oxlint-disable react/no-object-type-as-default-prop -- Existing merged lint debt; keep green while preserving behavior. */
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

import type { AtlassianBacklogResponse, BackendApi } from "~/t3work/backend/t3work-types";
import type { T3workPollingBackend } from "~/t3work/backend/t3work-pollingBackend";
import {
  ATLASSIAN_BACKLOG_CACHE_MAX_AGE_MS,
  type BacklogSelectionInput,
} from "~/t3work/hooks/t3work-projectBacklogCache";
import { createProjectBacklogState } from "~/t3work/hooks/t3work-projectBacklogState";
import { useT3workPersistedRouteState } from "~/t3work/hooks/t3work-usePersistedRouteState";
import { useProjectBacklogController } from "~/t3work/hooks/t3work-useProjectBacklogController";

type TestRouteSearch = {
  value?: string;
};

type TestState = {
  value: number;
};

const {
  createSubtaskSpy,
  updateAssigneeSpy,
  updateEstimateSpy,
  navigateSpy,
  readPersistedStateSpy,
  writePersistedStateSpy,
} = vi.hoisted(() => ({
  createSubtaskSpy: vi.fn(async () => ({ id: "subtask-1", key: "PROJ-2" })),
  updateAssigneeSpy: vi.fn(async () => undefined),
  updateEstimateSpy: vi.fn(async () => undefined),
  navigateSpy: vi.fn(),
  readPersistedStateSpy: vi.fn(() => ({ value: 1 }) satisfies Partial<TestState>),
  writePersistedStateSpy: vi.fn(),
}));

vi.mock("~/t3work/hooks/t3work-projectBacklogControllerActions", () => ({
  createProjectBacklogControllerActions: () => ({
    updateAssignee: updateAssigneeSpy,
    updateEstimate: updateEstimateSpy,
    createSubtask: createSubtaskSpy,
  }),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

  return {
    ...actual,
    useNavigate: () => navigateSpy,
    useRouterState: ({
      select,
    }: {
      select: (state: {
        location: { pathname: string; search: Record<string, unknown> };
      }) => unknown;
    }) =>
      select({
        location: {
          pathname: "/t3work/projects/project-1",
          search: {},
        },
      }),
  };
});

type DeferredPromise<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
};

function createDeferredPromise<T>(): DeferredPromise<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createBacklogResponse(updatedAt: number): AtlassianBacklogResponse {
  return {
    page: {
      items: [
        {
          provider: "atlassian",
          kind: "issue",
          id: "PROJ-1",
          displayId: "PROJ-1",
          title: "Cached backlog issue",
          url: "https://example.test/browse/PROJ-1",
          projectId: "10008",
          status: "To Do",
          type: "Task",
        },
      ],
      totalCount: 1,
    },
    capabilities: {
      canCreateSubtasks: true,
      estimateFieldLabel: "Story Points",
    },
    boards: [
      {
        id: "95",
        name: "Backlog board",
      },
    ],
    sprints: [
      {
        id: "3185",
        name: "Current sprint",
        boardId: "95",
      },
    ],
    savedFilters: [],
    selectedBoardId: "95",
    selectedSprintId: "3185",
    cache: {
      source: "persisted",
      updatedAt,
      fingerprint: "sha256:backlog-fp-1",
    },
  };
}

function createBackend(input: {
  readonly listBacklog: BackendApi["atlassian"]["listBacklog"];
  readonly pollBacklog: T3workPollingBackend["atlassian"]["pollBacklog"];
}): BackendApi {
  const atlassian = {
    getTempoCapacity: vi.fn(async (input: { from: string; to: string }) => ({
      configured: false,
      from: input.from,
      to: input.to,
      capacities: [],
    })),
    setTempoToken: vi.fn(async () => ({ configured: false })),
    listAccounts: vi.fn(async () => []),
    connectBasic: vi.fn(async () => []),
    connectOAuth: vi.fn(async () => []),
    exchangeOAuthCode: vi.fn(async () => ({
      token: { accessToken: "", refreshToken: "", expiresIn: 0 },
      sites: [],
    })),
    listProjects: vi.fn(async () => []),
    listResources: vi.fn(async () => ({ items: [] })),
    listBacklog: input.listBacklog,
    pollBacklog: input.pollBacklog,
    getBoardColumns: vi.fn(async () => ({ availableStatuses: [], boardColumns: [] })),
    getResource: vi.fn(async () => ({
      ref: {
        provider: "atlassian",
        kind: "issue" as const,
        id: "PROJ-1",
        title: "Cached backlog issue",
      },
      fetchedAt: new Date(0).toISOString(),
      fields: {},
    })),
    searchAssignableUsers: vi.fn(async () => []),
    updateIssueAssignee: vi.fn(async () => undefined),
    updateIssueEstimate: vi.fn(async () => ({ label: "Story Points" })),
    updateIssueStatus: vi.fn(async () => ({ status: "Done" })),
    createSubtask: vi.fn(async () => ({ id: "subtask-1", key: "PROJ-2" })),
    downloadAsset: vi.fn(async () => ({ base64Contents: "", sizeBytes: 0 })),
  } satisfies BackendApi["atlassian"] & Pick<T3workPollingBackend["atlassian"], "pollBacklog">;

  return {
    state: {
      connectionStatus: "connected",
      serverConfig: null,
      providers: [],
      error: null,
    },
    connect: async () => undefined,
    disconnect: async () => undefined,
    dispatchCommand: async () => undefined,
    launchRecipeWorkflow: async () => ({ ok: true }),
    submitRecipeCardAction: async () => ({ ok: true }),
    resolveWorkflowInput: async () => undefined,
    listThreadPlacements: async () => [],
    syncThreadToolContext: async () => undefined,
    atlassian: atlassian as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {} as BackendApi["projectWorkspace"],
  };
}

function ControllerHarness({
  backend,
  requestedSelection = {},
}: {
  backend: BackendApi;
  requestedSelection?: BacklogSelectionInput;
}) {
  const [backlogState, setBacklogState] = useState(() => createProjectBacklogState("project-1"));
  const currentSelection: BacklogSelectionInput = {
    ...(backlogState.selectedBoardId ? { boardId: backlogState.selectedBoardId } : {}),
    ...(backlogState.selectedSprintId ? { sprintId: backlogState.selectedSprintId } : {}),
    ...(backlogState.selectedFilterId ? { filterId: backlogState.selectedFilterId } : {}),
  };

  useProjectBacklogController({
    backend,
    connectedSource: {
      provider: "atlassian",
      accountId: "https://nexwork.atlassian.net",
      externalProjectId: "10008",
    },
    projectId: "project-1",
    requestedSelection,
    currentSelection,
    setBacklogState,
  });

  return <div data-testid="ticket-count">{String(backlogState.tickets.length)}</div>;
}

function PersistedRouteHarness() {
  const { state } = useT3workPersistedRouteState<TestState, Partial<TestState>, TestRouteSearch>({
    storageKey: "persisted-route-state:test",
    parseSearch: () => ({}),
    readPersistedState: () => readPersistedStateSpy(),
    writePersistedState: (_storageKey, nextState) => {
      writePersistedStateSpy(nextState);
    },
    resolveState: ({ persisted }) => ({ value: persisted?.value ?? 0 }),
    buildRouteSearch: (nextState) => ({ value: String(nextState.value) }),
    areStatesEqual: (left, right) => left.value === right.value,
    areRouteSearchEqual: (left, right) => left.value === right.value,
    stripRouteSearchParams: (params) => params,
  });

  return <div data-testid="state-value">{String(state.value)}</div>;
}

function PersistedRouteSetterHarness() {
  const { state, setState } = useT3workPersistedRouteState<
    TestState,
    Partial<TestState>,
    TestRouteSearch
  >({
    storageKey: "persisted-route-state:test",
    parseSearch: () => ({}),
    readPersistedState: () => readPersistedStateSpy(),
    writePersistedState: (_storageKey, nextState) => {
      writePersistedStateSpy(nextState);
    },
    resolveState: ({ persisted }) => ({ value: persisted?.value ?? 0 }),
    buildRouteSearch: (nextState) => ({ value: String(nextState.value) }),
    areStatesEqual: (left, right) => left.value === right.value,
    areRouteSearchEqual: (left, right) => left.value === right.value,
    stripRouteSearchParams: (params) => params,
  });

  return (
    <div>
      <button data-testid="update-state" onClick={() => setState({ value: state.value + 1 })}>
        update
      </button>
      <div data-testid="state-value">{String(state.value)}</div>
    </div>
  );
}

describe("useT3workPersistedRouteState", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("does not reread persisted state on every rerender when callback props are unstable", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(<PersistedRouteHarness />, { container: host });

    try {
      await vi.waitFor(() => {
        expect(host.querySelector('[data-testid="state-value"]')?.textContent).toBe("1");
      });

      await vi.waitFor(() => {
        expect(readPersistedStateSpy).toHaveBeenCalledTimes(2);
      });

      expect(readPersistedStateSpy).toHaveBeenCalledTimes(2);
      expect(writePersistedStateSpy).not.toHaveBeenCalled();
    } finally {
      await screen.unmount();
      host.remove();
    }
  });

  it("does not enqueue duplicate route updates when setState also updates search", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(<PersistedRouteSetterHarness />, { container: host });

    try {
      await vi.waitFor(() => {
        expect(host.querySelector('[data-testid="state-value"]')?.textContent).toBe("1");
      });

      navigateSpy.mockClear();

      host
        .querySelector('[data-testid="update-state"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await vi.waitFor(() => {
        expect(host.querySelector('[data-testid="state-value"]')?.textContent).toBe("2");
      });

      expect(navigateSpy).toHaveBeenCalledTimes(1);
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});

describe("useProjectBacklogController", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("waits for the first backlog response before starting background refresh polling", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T18:30:35.000Z"));

    const cachedBacklogDeferred = createDeferredPromise<AtlassianBacklogResponse>();
    const listBacklogSpy = vi.fn<BackendApi["atlassian"]["listBacklog"]>((request) => {
      if (request.forceRefresh) {
        return new Promise<AtlassianBacklogResponse>(() => undefined);
      }

      return cachedBacklogDeferred.promise;
    });
    const pollBacklogSpy = vi.fn(async () => ({
      unchanged: true as const,
      fingerprint: "sha256:backlog-fp-1",
    }));

    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(
      <ControllerHarness
        backend={createBackend({ listBacklog: listBacklogSpy, pollBacklog: pollBacklogSpy })}
      />,
      { container: host },
    );

    try {
      await vi.advanceTimersByTimeAsync(1);

      expect(listBacklogSpy).toHaveBeenCalledTimes(1);
      expect(listBacklogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          account: {
            id: "https://nexwork.atlassian.net",
            provider: "atlassian",
          },
          externalProjectId: "10008",
        }),
      );
      expect(listBacklogSpy.mock.calls[0]?.[0].forceRefresh).toBeUndefined();
      expect(pollBacklogSpy).not.toHaveBeenCalled();

      cachedBacklogDeferred.resolve(
        createBacklogResponse(Date.now() - ATLASSIAN_BACKLOG_CACHE_MAX_AGE_MS - 1),
      );

      await vi.waitFor(() => {
        expect(host.querySelector('[data-testid="ticket-count"]')?.textContent).toBe("1");
      });

      await vi.advanceTimersByTimeAsync(1);

      await vi.waitFor(() => {
        expect(pollBacklogSpy).toHaveBeenCalledTimes(1);
      });
      expect(listBacklogSpy).toHaveBeenCalledTimes(1);
    } finally {
      cachedBacklogDeferred.reject(new Error("test cleanup"));
      await screen.unmount();
      host.remove();
    }
  });

  it("does not repeat the automatic persisted refresh after a StrictMode remount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T18:30:35.000Z"));

    const backlogResponse = createBacklogResponse(Date.now());
    const listBacklogSpy = vi.fn<BackendApi["atlassian"]["listBacklog"]>(
      async () => backlogResponse,
    );
    const pollBacklogSpy = vi.fn(async () => ({
      unchanged: true as const,
      fingerprint: backlogResponse.cache?.fingerprint ?? "sha256:backlog-fp-1",
    }));

    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(
      <StrictMode>
        <ControllerHarness
          backend={createBackend({ listBacklog: listBacklogSpy, pollBacklog: pollBacklogSpy })}
        />
      </StrictMode>,
      { container: host },
    );

    try {
      await vi.waitFor(() => {
        expect(host.querySelector('[data-testid="ticket-count"]')?.textContent).toBe("1");
      });

      await vi.waitFor(() => {
        expect(pollBacklogSpy).toHaveBeenCalledTimes(1);
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(pollBacklogSpy).toHaveBeenCalledTimes(1);
      expect(
        listBacklogSpy.mock.calls.filter(([request]) => request.forceRefresh === true),
      ).toHaveLength(0);
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});
