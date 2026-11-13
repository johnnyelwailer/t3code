/* oxlint-disable t3code/no-dom-test-environment -- Render-loop budget needs a DOM; this stays a unit file so CI runs it without Playwright. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render-loop cap can fail the test. */
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

import {
  FOUR_REPOS,
  LIVE_SHAPED_DISCOVERY,
  RENDER_CAP,
  bumpRenderCount,
  flushEffects,
} from "~/t3team/test/t3team-liveShapedSurface";

void LIVE_SHAPED_DISCOVERY;

const live = vi.hoisted(() => {
  const bag = {
    renderCount: 0,
    runnerCalls: 0,
    inboxCalls: 0,
    reads: 0,
    status: [] as LinkedRepositorySyncResult[],
    urls: [
      "https://github.com/hive/MILO5",
      "https://github.com/hive/milo5-agentic",
      "https://github.com/hive/milo5-mocks",
      "https://github.com/hive/milo5-ops",
    ] as string[],
    backend: null as unknown,
  };
  bag.backend = {
    github: {
      discoverInbox: async () => {
        bag.inboxCalls += 1;
        return {
          host: "github.com",
          account: "yg",
          suggestedRepositoryUrls: [...bag.urls],
          repositories: bag.urls.map((url: string) => ({
            id: url,
            nameWithOwner: url.replace("https://github.com/", ""),
            url,
            host: "github.com",
          })),
        };
      },
    },
    projectWorkspace: {
      readLinkedRepositoryStatus: async () => {
        bag.reads += 1;
        return { linkedRepositories: bag.status.map((entry) => ({ ...entry })) };
      },
      syncLinkedRepository: async () => {},
    },
  };
  return bag;
});

vi.mock("~/state/environments", () => ({
  usePrimaryEnvironmentId: () => "env-1",
}));

vi.mock("~/state/sourceControl", () => ({
  sourceControlEnvironment: { discovery: {} },
}));

vi.mock("~/hooks/useLiveRefresh", () => ({
  useLiveRefresh: () => {},
}));

vi.mock("~/t3team/hooks/t3team-useRepositoryListFollowUp", () => ({
  useRepositoryListFollowUp: () => {},
}));

// A new function identity every time this hook runs — the real useAtomQueryRunner
// does the same from an uncompiled caller that passes a fresh options object.
vi.mock("~/state/use-atom-query-runner", async () => {
  const { AsyncResult } = await import("effect/reactivity");
  return {
    useAtomQueryRunner: () => async () => {
      live.runnerCalls += 1;
      return AsyncResult.success({
        sourceControlProviders: [
          {
            kind: "github",
            auth: {
              status: "authenticated" as const,
              host: "github.com",
              account: "yg",
              accounts: [
                { host: "github.com", account: "yg", active: true, authenticated: true },
              ],
            },
          },
        ],
      });
    },
  };
});

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => live.backend,
}));

vi.mock("~/t3team/components/t3team-RepositoryPicker", async () => {
  const { createElement } = await import("react");
  return {
    RepositoryPicker: (props: {
      linkedUrls: ReadonlyArray<string>;
      renderLinkedStatus?: (url: string) => unknown;
    }) =>
      createElement(
        "div",
        { "data-testid": "picker" },
        props.linkedUrls.map((url) =>
          createElement(
            "div",
            { key: url, "data-url": url },
            props.renderLinkedStatus?.(url) ?? null,
          ),
        ),
      ),
  };
});

vi.mock("~/t3team/hooks/t3team-useSaveProjectRepositories", () => ({
  useSaveProjectRepositories: () => ({
    save: async () => {},
    saving: false,
    saved: null,
    saveError: undefined,
    unchangedSinceSave: true,
    syncView: { visible: false, steps: [], hide: () => {} },
  }),
}));

vi.mock("~/t3team/hooks/t3team-persistMainRepository", () => ({
  usePersistMainRepository: ({ initialMainUrl }: { initialMainUrl: string | null }) => ({
    state: { mainUrl: initialMainUrl, pendingUrl: null, error: null },
    persist: async () => {},
    setLocal: () => {},
    retry: () => {},
  }),
}));

vi.mock("~/t3team/hooks/t3team-useLinkedRepositoryBranches", () => ({
  useLinkedRepositoryBranches: () => ({
    branches: new Map(),
    byUrl: new Map(),
    changed: false,
    branchFor: () => "",
    setBranch: () => {},
  }),
}));

vi.mock("~/t3team/t3team-serverState", () => ({
  useServerConfig: () => ({ mainRepository: true }),
}));

vi.mock("~/t3team/t3team-useFeatureFlag", () => ({
  readServerFeatureFlag: () => true,
  readServerFeatureFlagOr: (_c: unknown, _n: string, fallback: boolean) => fallback,
}));

vi.mock("~/t3team/components/t3team-LinkedRepositoryBranchControl", () => ({
  LinkedRepositoryBranchControl: () => null,
}));

import { ManageProjectRepositoriesDialog } from "~/t3team/t3team-ManageProjectRepositoriesDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = {
  id: "proj-1",
  title: "Project Alpha",
  workspace: { rootPath: "/ws" },
  source: {
    externalProjectKey: "MILO5",
    raw: {
      agentReferences: {
        linkedRepositories: FOUR_REPOS.map((url) => ({ url })),
      },
    },
  },
  settings: {
    repositories: FOUR_REPOS.map((url, index) => ({ url, isMain: index === 0 })),
  },
} as unknown as ProjectShellProject;

function Surface() {
  bumpRenderCount(live, "ManageProjectRepositoriesDialog");
  return createElement(ManageProjectRepositoriesDialog, {
    project,
    onClose: () => {},
    onProjectUpdated: () => {},
  });
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.renderCount = 0;
  live.runnerCalls = 0;
  live.inboxCalls = 0;
  live.reads = 0;
  live.status = FOUR_REPOS.map((url, index) => ({
    url,
    localPath: `/tmp/${url.split("/").pop()}`,
    status: index === 0 ? "failed" : "cloned",
    ...(index === 0 ? { error: "disk full" } : {}),
  })) as LinkedRepositorySyncResult[];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("ManageProjectRepositoriesDialog loop guard (live-shaped discovery and sync)", () => {
  it("mounts with real discovery and inline Retry, and does not loop", async () => {
    await act(async () => {
      root!.render(createElement(Surface));
    });
    await flushEffects();
    expect(live.runnerCalls).toBeGreaterThanOrEqual(1);
    expect(live.runnerCalls).toBeLessThan(15);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(host!.textContent).not.toMatch(/Continue in background/i);
    const retries = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retries.length).toBeGreaterThanOrEqual(1);
    const before = live.renderCount;
    await act(async () => {
      retries[0]!.click();
    });
    await flushEffects();
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(live.renderCount - before).toBeLessThan(20);
  });
});
