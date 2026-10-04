// @vitest-environment jsdom
/**
 * The paused banner must say WHEN the run was paused and offer Resume right there (GHE #403 §2:
 * a run paused at 21:40 sat behind a bare "Run paused" all night).
 */
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { pausedBannerLabel, RunStatusBanner } from "~/t3team/chat/t3team-workflowRunBanner";

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}

const HOUR_MS = 3_600_000;
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * HOUR_MS).toISOString();

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

describe("pausedBannerLabel", () => {
  it("names the age of the pause", () => {
    // Real timers stay on: the render tests below share this file, and React's act() scheduling
    // does not survive a faked clock.
    expect(pausedBannerLabel(hoursAgo(9.3))).toBe("Paused 9h ago");
    expect(pausedBannerLabel(new Date(Date.now() - 2 * 60_000 - 5_000).toISOString())).toBe(
      "Paused 2m ago",
    );
    expect(pausedBannerLabel(new Date(Date.now() - 10_000).toISOString())).toBe("Paused just now");
    expect(pausedBannerLabel(undefined)).toBe("Run paused");
  });
});

describe("RunStatusBanner (paused)", () => {
  it("shows when the run was paused and a Resume button that calls back", async () => {
    const onResume = vi.fn();
    const container = await renderNode(
      <RunStatusBanner run={{ phase: "paused" }} pausedAt={hoursAgo(9.3)} onResume={onResume} />,
    );
    expect(container.textContent).toContain("Paused 9h ago");
    const button = container.querySelector<HTMLButtonElement>("[data-run-resume]");
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("offers no Resume button when the viewer cannot control the run", async () => {
    const container = await renderNode(<RunStatusBanner run={{ phase: "paused" }} />);
    expect(container.textContent).toContain("Run paused");
    expect(container.querySelector("[data-run-resume]")).toBeNull();
  });

  it("offers a Retry button on the failed banner that calls back (GHE #344)", async () => {
    const onResume = vi.fn();
    const container = await renderNode(
      <RunStatusBanner
        run={{ phase: "failed", error: "The agent turn failed: gateway down" }}
        onResume={onResume}
      />,
    );
    expect(container.textContent).toContain("Run failed");
    expect(container.textContent).toContain("gateway down");
    expect(container.textContent).toContain("Retry");
    const button = container.querySelector<HTMLButtonElement>("[data-run-resume]");
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("keeps the failed banner free of a Retry button when the viewer cannot control the run", async () => {
    const container = await renderNode(
      <RunStatusBanner run={{ phase: "failed", error: "The agent turn failed: gateway down" }} />,
    );
    expect(container.textContent).toContain("Run failed");
    expect(container.querySelector("[data-run-resume]")).toBeNull();
  });

  it("says Retrying while a retry is in flight", async () => {
    const container = await renderNode(
      <RunStatusBanner run={{ phase: "failed" }} onResume={() => {}} resumePending />,
    );
    expect(container.textContent).toContain("Retrying…");
  });
});
