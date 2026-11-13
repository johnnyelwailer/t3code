/* oxlint-disable t3code/no-dom-test-environment -- Progress is a jsdom unit of the Add-path view; Browser Mode is the wrong environment for a render-budget check. */
/* oxlint-disable t3code/require-disposable-render -- Direct createRoot, same as the probe and Open-existing harnesses. */
// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

const live = vi.hoisted(() => ({
  byUrl: new Map<string, LinkedRepositorySyncResult>(),
}));

vi.mock("~/t3team/hooks/t3team-useLinkedRepositorySyncStatus", () => ({
  useLinkedRepositorySyncStatus: () => ({
    byUrl: live.byUrl,
    refresh: () => {},
    syncNow: async () => {},
  }),
}));

import { CreateProjectProgress } from "~/t3team/t3team-CreateProjectProgress";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOUR = [
  "https://github.com/hive/MILO5",
  "https://github.com/hive/milo5-agentic",
  "https://github.com/hive/milo5-mocks",
  "https://github.com/hive/milo5-ops",
] as const;

const TEN = Array.from(
  { length: 12 },
  (_, index) => `https://github.com/hive/repo-${String(index + 1).padStart(2, "0")}`,
);

let root: Root | null = null;
let host: HTMLElement | null = null;

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

function render(
  urls: ReadonlyArray<string>,
  handlers: {
    onContinueInBackground?: () => void;
    onDone?: () => void;
    onRetry?: () => void;
    onCancel?: () => void;
  } = {},
  workspaceRoot: string | undefined = "/tmp/milo5",
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const show = () =>
    act(() => {
      root!.render(
        createElement(CreateProjectProgress, {
          urls,
          workspaceRoot,
          onContinueInBackground: handlers.onContinueInBackground ?? (() => {}),
          onDone: handlers.onDone ?? (() => {}),
          onRetry: handlers.onRetry ?? (() => {}),
          onCancel: handlers.onCancel ?? (() => {}),
        }),
      );
    });
  show();
  return { show };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  live.byUrl = new Map();
});

beforeEach(() => {
  live.byUrl = new Map();
});

const progress = () => document.querySelector('[data-testid="create-project-progress"]');
const modal = () => document.querySelector('[data-testid="linked-repository-sync-modal"]');
const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find((button) => button.textContent?.includes(text));

describe("CreateProjectProgress", () => {
  it("lists all four linked repositories while a clone is in flight", () => {
    live.byUrl = new Map(
      FOUR.map((url, index) => [url, entry(url, "pending", index === 0 ? "cloning" : "queued")]),
    );
    render(FOUR);
    expect(progress()).not.toBeNull();
    expect(modal()?.textContent).toContain("MILO5");
    expect(modal()?.textContent).toContain("milo5-agentic");
    expect(modal()?.textContent).toContain("milo5-mocks");
    expect(modal()?.textContent).toContain("milo5-ops");
    expect(modal()?.textContent).toContain("Cloning — a large repository takes a while");
    expect(buttonByText("Continue in background")).not.toBeUndefined();
  });

  it("lists ten or more linked repositories in one view", () => {
    live.byUrl = new Map(TEN.map((url) => [url, entry(url, "pending", "queued")]));
    render(TEN);
    for (const url of TEN) {
      expect(modal()?.textContent).toContain(url.split("/").pop());
    }
    expect(buttonByText("Continue in background")).not.toBeUndefined();
  });

  it("shows a slow clone without locking the rest of the UI behind it", () => {
    live.byUrl = new Map([
      [FOUR[0], entry(FOUR[0], "pending", "cloning")],
      [FOUR[1], entry(FOUR[1], "cloned")],
      [FOUR[2], entry(FOUR[2], "pending", "queued")],
      [FOUR[3], entry(FOUR[3], "not-cloned")],
    ]);
    render(FOUR);
    expect(modal()?.textContent).toContain("Cloning — a large repository takes a while");
    expect(modal()?.textContent).toContain("In the queue");
    expect(modal()?.textContent).toContain("Ready");
    expect(modal()?.textContent).toContain("Linked — cloned when needed");
    expect(buttonByText("Continue in background")).not.toBeUndefined();
  });

  it("offers Try again and Cancel when a repository fails", () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    live.byUrl = new Map([
      [FOUR[0], entry(FOUR[0], "failed", undefined, "disk full")],
      [FOUR[1], entry(FOUR[1], "cloned")],
      [FOUR[2], entry(FOUR[2], "cloned")],
      [FOUR[3], entry(FOUR[3], "cloned")],
    ]);
    render(FOUR, { onRetry, onCancel });
    expect(modal()?.textContent).toContain("disk full");
    expect(modal()?.textContent).toContain("Sync needs attention");
    act(() => buttonByText("Try again")!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => buttonByText("Cancel")!.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Continue in background leaves without waiting for clones", () => {
    const onContinue = vi.fn();
    live.byUrl = new Map(FOUR.map((url) => [url, entry(url, "pending", "cloning")]));
    render(FOUR, { onContinueInBackground: onContinue });
    act(() => buttonByText("Continue in background")!.click());
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("Done fires once every repository is recorded", () => {
    const onDone = vi.fn();
    live.byUrl = new Map(FOUR.map((url) => [url, entry(url, "cloned")]));
    render(FOUR, { onDone });
    expect(buttonByText("Done")).not.toBeUndefined();
    act(() => buttonByText("Done")!.click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
