/* oxlint-disable t3code/no-dom-test-environment -- The sync-status hook's one-write contract is observed through a DOM render. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render budget can fail the test. */
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectShellProject } from "@t3tools/project-context";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import {
  FOUR_REPOS,
  RENDER_CAP,
  bumpRenderCount,
  flushEffects,
} from "~/t3team/test/t3team-liveShapedSurface";
import { replaceLinkedRepositoryUrlsInProject } from "~/t3team/hooks/t3team-createProjectBootstrap";

const live = vi.hoisted(() => {
  const bag = {
    renderCount: 0,
    writes: 0,
    lastUrls: [] as string[],
    status: [] as LinkedRepositorySyncResult[],
    backend: null as unknown,
  };
  bag.backend = {
    projectWorkspace: {
      readLinkedRepositoryStatus: async () => {
        bag.writes += 1;
        return { linkedRepositories: bag.status.map((entry) => ({ ...entry })) };
      },
      syncLinkedRepository: async () => {},
      bootstrapWorkspace: async (input: { linkedRepositoryUrls: ReadonlyArray<string> }) => {
        bag.writes += 1;
        bag.lastUrls = [...input.linkedRepositoryUrls];
        return {
          workspaceRoot: "/tmp/milo5",
          referencesRoot: "/tmp/milo5",
          workspaceRepositoryInitialized: true,
          linkedRepositories: input.linkedRepositoryUrls.map((url) => ({
            url,
            localPath: `/tmp/${url.split("/").pop()}`,
          })),
        };
      },
    },
  };
  return bag;
});

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => live.backend,
}));

vi.mock("./t3team-projectMainRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./t3team-projectMainRepository")>();
  return {
    ...actual,
    applyMainRepositoryAutoDetection: async ({ project }: { project: ProjectShellProject }) =>
      project,
  };
});

import { saveProjectRepositories } from "~/t3team/hooks/t3team-saveProjectRepositories";
import { useLinkedRepositorySyncStatus } from "~/t3team/hooks/t3team-useLinkedRepositorySyncStatus";
import { useBackend } from "~/t3team/backend/t3team-index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project = {
  id: "p-milo5",
  title: "MILO5",
  workspace: { rootPath: "/tmp/milo5" },
  source: { raw: { agentReferences: { linkedRepositories: [] } } },
} as unknown as ProjectShellProject;

function SyncHost(props: { onByUrl: (size: number) => void }) {
  bumpRenderCount(live, "useLinkedRepositorySyncStatus");
  const { byUrl } = useLinkedRepositorySyncStatus({
    workspaceRoot: "/tmp/milo5",
    enabled: true,
  });
  props.onByUrl(byUrl.size);
  return createElement("div", { "data-size": byUrl.size }, String(byUrl.size));
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.renderCount = 0;
  live.writes = 0;
  live.lastUrls = [];
  live.status = FOUR_REPOS.map((url) => ({
    url,
    localPath: `/tmp/${url.split("/").pop()}`,
    status: "cloned",
  })) as LinkedRepositorySyncResult[];
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("batched repository updates", () => {
  it("replaceLinkedRepositoryUrlsInProject writes every URL into one project object", () => {
    const next = replaceLinkedRepositoryUrlsInProject(project, FOUR_REPOS);
    const urls = (
      next.source.raw as { agentReferences: { linkedRepositories: Array<{ url: string }> } }
    ).agentReferences.linkedRepositories.map((entry) => entry.url);
    expect(urls).toEqual([...FOUR_REPOS]);
    expect(next).not.toBe(project);
  });

  it("saveProjectRepositories bootstraps once with every URL", async () => {
    live.writes = 0;
    const backend = useBackend();
    const saved = await saveProjectRepositories({
      backend: backend as never,
      project,
      linkedRepositoryUrls: [...FOUR_REPOS],
    });
    expect(live.writes).toBe(1);
    expect(live.lastUrls).toEqual([...FOUR_REPOS]);
    expect(saved.id).toBe("p-milo5");
  });

  it("useLinkedRepositorySyncStatus applies all repositories in one store update per poll", async () => {
    let size = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        createElement(SyncHost, {
          onByUrl: (next) => {
            size = next;
          },
        }),
      );
    });
    await flushEffects();
    expect(size).toBe(4);
    expect(live.writes).toBe(1);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    // One poll, one setEntries: a handful of renders, not one per repository.
    expect(live.renderCount).toBeLessThan(8);
  });
});
