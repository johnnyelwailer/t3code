/* oxlint-disable t3code/no-dom-test-environment -- Re-render counts need a DOM; this stays a unit file so CI runs it without Playwright. */
// @vitest-environment jsdom
/* oxlint-disable t3code/require-disposable-render -- Unit-file createRoot, same as the sibling view tests. */
import { act, memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { LinkedRepositorySyncStatusLine } from "~/t3team/components/t3team-LinkedRepositorySyncStatusLine";
import { renderCounter } from "~/test/t3team-renderCounter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const URL = "https://github.com/hive/MILO5";
const FAILED: LinkedRepositorySyncResult = {
  url: URL,
  localPath: "/tmp/MILO5",
  status: "failed",
  error: "disk full",
};
const READY: LinkedRepositorySyncResult = {
  url: URL,
  localPath: "/tmp/MILO5",
  status: "cloned",
};

const counter = renderCounter();
const stableSync = vi.fn(async (_url: string) => {});

const CountingLine = memo(function CountingLine(props: { entry: LinkedRepositorySyncResult }) {
  counter.count("line");
  return <LinkedRepositorySyncStatusLine entry={props.entry} onSync={stableSync} />;
});

function Interactive({ initial = FAILED }: { initial?: LinkedRepositorySyncResult }) {
  const [tick, setTick] = useState(0);
  const [entry, setEntry] = useState(initial);
  return (
    <div data-tick={tick}>
      <button type="button" data-testid="tick" onClick={() => setTick((n) => n + 1)}>
        tick
      </button>
      <button type="button" data-testid="ready" onClick={() => setEntry(READY)}>
        ready
      </button>
      <CountingLine entry={entry} />
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
  stableSync.mockReset();
});

afterEach(() => {
  root.unmount();
  container.remove();
});

describe("LinkedRepositorySyncStatusLine", () => {
  it("shows a single Retry on failure, and no Continue in background", async () => {
    await act(async () => {
      root.render(<Interactive />);
    });
    expect(container.textContent).toContain("Sync failed");
    expect(container.textContent).toContain("disk full");
    expect(container.textContent).not.toMatch(/Continue in background/i);
    const retries = [...document.querySelectorAll("button")].filter(
      (button) => button.textContent === "Retry",
    );
    expect(retries).toHaveLength(1);
    await act(async () => {
      retries[0]!.click();
    });
    expect(stableSync).toHaveBeenCalledWith(URL);
  });

  it("a parent re-render with the same entry does not re-render the line", async () => {
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
