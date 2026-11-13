/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts and inline Retry need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the sibling view tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { renderCounter } from "~/test/t3team-renderCounter";

const live = vi.hoisted(() => ({
  byUrl: new Map<string, LinkedRepositorySyncResult>(),
  syncNow: vi.fn(async (_url: string) => {}),
}));

vi.mock("~/t3team/hooks/t3team-useLinkedRepositorySyncStatus", () => ({
  useLinkedRepositorySyncStatus: () => ({
    byUrl: live.byUrl,
    refresh: () => {},
    syncNow: live.syncNow,
  }),
}));

import { LinkedRepositorySyncChips } from "~/t3team/components/t3team-LinkedRepositorySyncChips";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOUR = [
  "https://github.com/hive/MILO5",
  "https://github.com/hive/milo5-agentic",
  "https://github.com/hive/milo5-mocks",
  "https://github.com/hive/milo5-ops",
] as const;

const TWELVE = Array.from(
  { length: 12 },
  (_, index) => `https://github.com/hive/repo-${String(index + 1).padStart(2, "0")}`,
);

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

const counter = renderCounter();

const CountingChips = memo(function CountingChips(props: { workspaceRoot: string | undefined }) {
  counter.count("chips");
  return <LinkedRepositorySyncChips workspaceRoot={props.workspaceRoot} />;
});

function Interactive({ workspaceRoot = "/tmp/milo5" }: { workspaceRoot?: string }) {
  const [tick, setTick] = useState(0);
  return (
    <div data-tick={tick}>
      <button type="button" data-testid="tick" onClick={() => setTick((n) => n + 1)}>
        tick
      </button>
      <CountingChips workspaceRoot={workspaceRoot} />
    </div>
  );
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  counter.reset();
  live.byUrl = new Map();
  live.syncNow.mockReset();
});

afterEach(() => {
  root.unmount();
  container.remove();
});

const chips = () => document.querySelector('[data-testid="linked-repository-sync-chips"]');

describe("LinkedRepositorySyncChips", () => {
  it("lists four repositories with live clone status, without a Continue in background button", async () => {
    live.byUrl = new Map(
      FOUR.map((url, index) => [url, entry(url, "pending", index === 0 ? "cloning" : "queued")]),
    );
    await act(async () => {
      root.render(<Interactive />);
    });
    expect(chips()?.textContent).toContain("MILO5");
    expect(chips()?.textContent).toContain("milo5-agentic");
    expect(chips()?.textContent).toContain("milo5-mocks");
    expect(chips()?.textContent).toContain("milo5-ops");
    expect(chips()?.textContent).toContain("Cloning…");
    expect(chips()?.textContent).toContain("Waiting to sync");
    expect(container.textContent).not.toMatch(/Continue in background/i);
    counter.expectRerendered({ chips: 1 });
  });

  it("lists twelve repositories in one non-blocking row", async () => {
    live.byUrl = new Map(TWELVE.map((url) => [url, entry(url, "pending", "queued")]));
    await act(async () => {
      root.render(<Interactive />);
    });
    for (const url of TWELVE) {
      expect(chips()?.textContent).toContain(url.split("/").pop());
    }
    expect(container.textContent).not.toMatch(/Continue in background/i);
  });

  it("a failed repository offers a single Retry that starts a new sync", async () => {
    live.byUrl = new Map([
      [FOUR[0], entry(FOUR[0], "failed", undefined, "disk full")],
      [FOUR[1], entry(FOUR[1], "cloned")],
      [FOUR[2], entry(FOUR[2], "cloned")],
      [FOUR[3], entry(FOUR[3], "cloned")],
    ]);
    await act(async () => {
      root.render(<Interactive />);
    });
    expect(chips()?.textContent).toContain("disk full");
    expect(chips()?.textContent).toContain("Sync failed");
    const retries = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retries).toHaveLength(1);
    await act(async () => {
      retries[0]!.click();
    });
    expect(live.syncNow).toHaveBeenCalledTimes(1);
    expect(live.syncNow).toHaveBeenCalledWith(FOUR[0]);
  });

  it("a parent re-render with the same workspace does not re-render the chips", async () => {
    live.byUrl = new Map(FOUR.map((url) => [url, entry(url, "cloned")]));
    await act(async () => {
      root.render(<Interactive />);
    });
    counter.reset();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="tick"]')?.click();
    });
    counter.expectRerendered({});
  });
});
