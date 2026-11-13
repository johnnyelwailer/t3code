/* oxlint-disable t3code/no-dom-test-environment -- Render-loop and inline Retry budgets need a DOM; this stays a unit file so CI runs it without Playwright. */
/* oxlint-disable t3code/require-disposable-render -- Custom root so a render-loop cap can fail the test. */
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import {
  FOUR_REPOS,
  LIVE_SHAPED_DISCOVERY,
  RENDER_CAP,
  bumpRenderCount,
  flushEffects,
} from "~/t3team/test/t3team-liveShapedSurface";

void LIVE_SHAPED_DISCOVERY;

type StatusPayload = { linkedRepositories: ReadonlyArray<LinkedRepositorySyncResult> };

const live = vi.hoisted(() => {
  const bag = {
    renderCount: 0,
    syncCalls: [] as string[],
    reads: 0,
    status: { linkedRepositories: [] } as StatusPayload,
    backend: null as unknown,
  };
  bag.backend = {
    projectWorkspace: {
      readLinkedRepositoryStatus: async () => {
        bag.reads += 1;
        return {
          linkedRepositories: bag.status.linkedRepositories.map((entry) => ({ ...entry })),
        };
      },
      syncLinkedRepository: async ({ url }: { url: string }) => {
        bag.syncCalls.push(url);
      },
    },
  };
  return bag;
});

// Live-shaped backend: the real sync hook is under test. Each read returns a new
// payload identity; the backend object itself is stable so a correct hook does not loop.
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => live.backend,
}));

import { LinkedRepositorySyncChips } from "~/t3team/components/t3team-LinkedRepositorySyncChips";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function entry(
  url: string,
  status: LinkedRepositorySyncResult["status"],
  syncState?: LinkedRepositorySyncResult["syncState"],
  error?: string,
): LinkedRepositorySyncResult {
  return {
    url,
    localPath: `/tmp/${url.split("/").pop()}`,
    status,
    ...(syncState ? { syncState } : {}),
    ...(error ? { error } : {}),
  };
}

function Surface() {
  bumpRenderCount(live, "LinkedRepositorySyncChips");
  return createElement(LinkedRepositorySyncChips, { workspaceRoot: "/tmp/milo5" });
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  live.renderCount = 0;
  live.syncCalls = [];
  live.reads = 0;
  live.status = { linkedRepositories: [] };
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

const chips = () => document.querySelector('[data-testid="linked-repository-sync-chips"]');

describe("LinkedRepositorySyncChips loop guard (live-shaped backend)", () => {
  it("lists four repositories and stays under the render cap", async () => {
    live.status = {
      linkedRepositories: FOUR_REPOS.map((url, index) =>
        entry(url, "pending", index === 0 ? "cloning" : "queued"),
      ),
    };
    await act(async () => {
      root!.render(createElement(Surface));
    });
    await flushEffects();
    expect(chips()?.textContent).toContain("MILO5");
    expect(chips()?.textContent).toContain("milo5-agentic");
    expect(chips()?.textContent).toContain("milo5-mocks");
    expect(chips()?.textContent).toContain("milo5-ops");
    expect(chips()?.textContent).toContain("Cloning");
    expect(host!.textContent).not.toMatch(/Continue in background/i);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(live.reads).toBeGreaterThanOrEqual(1);
    expect(live.reads).toBeLessThan(15);
  });

  it("a failed repository offers a single Retry; clicking it starts one sync and does not loop", async () => {
    live.status = {
      linkedRepositories: [
        entry(FOUR_REPOS[0], "failed", undefined, "disk full"),
        entry(FOUR_REPOS[1], "cloned"),
        entry(FOUR_REPOS[2], "cloned"),
        entry(FOUR_REPOS[3], "cloned"),
      ],
    };
    await act(async () => {
      root!.render(createElement(Surface));
    });
    await flushEffects();
    expect(chips()?.textContent).toContain("disk full");
    const retries = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retries).toHaveLength(1);
    await act(async () => {
      retries[0]!.click();
    });
    await flushEffects();
    expect(live.syncCalls).toEqual([FOUR_REPOS[0]]);
    expect(live.renderCount).toBeLessThan(RENDER_CAP);
    expect(host!.textContent).not.toMatch(/Continue in background/i);
    const retriesAfter = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retriesAfter).toHaveLength(1);
  });
});
