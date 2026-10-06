// @vitest-environment jsdom
/**
 * CloudSessionProvisionPanel — the list split: sessions still doing work
 * surface by default with their row actions, finished sessions sit in a
 * collapsed, capped history with no actions, and a clean empty state shows
 * when nothing is active.
 */
import type { CloudSession } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CloudSessionProvisionPanel } from "./t3team-CloudSessionProvisionPanel";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function session(overrides: Partial<CloudSession> & { sessionId: string }): CloudSession {
  return {
    providerKind: "github_actions",
    phase: "ready",
    detailsUrl: null,
    elapsedSeconds: 0,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim · 12 GB · 4 cores",
    failureReason: null,
    ...overrides,
  };
}

function render(element: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root!.render(element);
  });
  return container!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  vi.unstubAllGlobals();
  container?.remove();
  container = null;
  root = null;
});

function historyTrigger(node: HTMLDivElement): HTMLButtonElement {
  const trigger = Array.from(node.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("History ·"),
  );
  expect(trigger, "history trigger missing").toBeDefined();
  return trigger!;
}

function expandHistory(node: HTMLDivElement) {
  const trigger = historyTrigger(node);
  act(() => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("CloudSessionProvisionPanel", () => {
  it("says why the list could not load instead of waiting on skeletons", () => {
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[]}
        loading
        loadError="The authenticated token is missing required scope: relay:write."
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );
    expect(node.textContent).toContain(
      "Could not load your cloud sessions: The authenticated token is missing required scope: relay:write.",
    );
    expect(node.textContent).not.toContain("No active cloud sessions.");
  });

  it("surfaces active sessions with row actions and parks finished ones in history", () => {
    const onCreate = vi.fn();
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[
          session({ sessionId: "a-preparing", phase: "preparing", elapsedSeconds: 74 }),
          session({ sessionId: "h-stopped", phase: "stopped", elapsedSeconds: 4 * 3600 }),
          session({
            sessionId: "h-failed",
            phase: "failed",
            elapsedSeconds: 128,
            failureReason: "rejected",
          }),
        ]}
        onCreate={onCreate}
        onSessionAction={() => {}}
      />,
    );

    // Active: the live row and its action are shown.
    expect(node.textContent).toContain("Building the workspace");
    expect(node.textContent).toContain("Cancel");

    // Finished: parked in history, counted, and not shown while collapsed.
    expect(node.textContent).toContain("History · 2");
    expect(node.textContent).not.toContain("Stopped");
    expect(node.textContent).not.toContain("Provisioning failed");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("keeps history collapsed by default", () => {
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[
          session({ sessionId: "a-ready", phase: "ready" }),
          session({ sessionId: "h-stopped", phase: "stopped", elapsedSeconds: 3600 }),
        ]}
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );
    expect(historyTrigger(node).getAttribute("aria-expanded")).toBe("false");
  });

  it("expands history on trigger click and renders its rows without actions", () => {
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[
          session({ sessionId: "h-stopped", phase: "stopped", elapsedSeconds: 4 * 3600 }),
          session({
            sessionId: "h-failed",
            phase: "failed",
            elapsedSeconds: 128,
            failureReason: "rejected",
          }),
        ]}
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );

    expandHistory(node);

    expect(node.textContent).toContain("Provisioning failed");
    expect(node.textContent).toContain("Ran for 4h 0m");
    // History rows have nothing to act on — no per-row buttons in the panel.
    const labels = Array.from(node.querySelectorAll("button")).map((button) => button.textContent);
    expect(labels.filter((label) => label === "Retry" || label === "Start another")).toEqual([]);
  });

  it("caps history at the five most recent and reports the overflow", () => {
    const node = render(
      <CloudSessionProvisionPanel
        sessions={Array.from({ length: 7 }, (_, index) =>
          session({
            sessionId: `h${index + 1}`,
            phase: "stopped",
            elapsedSeconds: 3600 * (index + 1),
          }),
        )}
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );

    expect(node.textContent).toContain("History · 7");
    expandHistory(node);

    // Newest first in the server's list order: the five shown are h1..h5.
    for (let index = 1; index <= 5; index += 1) {
      expect(node.textContent).toContain(`Ran for ${index}h 0m`);
    }
    expect(node.textContent).not.toContain("Ran for 6h 0m");
    expect(node.textContent).not.toContain("Ran for 7h 0m");
    expect(node.textContent).toContain("2 older sessions hidden");
  });

  it("links the provider's full history from the capped list", () => {
    const historyUrl =
      "https://nexplore.ghe.com/hive/nx-nexi/actions/workflows/session.yml?query=actor%3Apj";
    const node = render(
      <CloudSessionProvisionPanel
        sessions={Array.from({ length: 6 }, (_, index) =>
          session({ sessionId: `h${index + 1}`, phase: "stopped" }),
        )}
        historyUrl={historyUrl}
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );
    expandHistory(node);

    const link = Array.from(node.querySelectorAll("a")).find(
      (anchor) => anchor.textContent === "View all in GitHub",
    );
    expect(link?.getAttribute("href")).toBe(historyUrl);
    expect(node.textContent).toContain("1 older sessions hidden");
  });

  it("owns a ready machine's lifecycle: Stop and Forget live on the panel row", () => {
    const onSessionSecondaryAction = vi.fn();
    const onSessionForget = vi.fn();
    const ready = session({ sessionId: "a-ready", phase: "ready", environmentId: "env-cloud" });
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[ready]}
        onCreate={() => {}}
        onSessionAction={() => {}}
        onSessionSecondaryAction={onSessionSecondaryAction}
        onSessionForget={onSessionForget}
        canForgetSession={() => true}
      />,
    );

    const stop = Array.from(node.querySelectorAll("button")).find(
      (button) => button.textContent === "Stop",
    );
    const forget = node.querySelector<HTMLButtonElement>(
      'button[aria-label="Forget this environment"]',
    );
    expect(stop).toBeDefined();
    expect(forget).not.toBeNull();
    act(() => {
      stop!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      forget!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSessionSecondaryAction).toHaveBeenCalledWith(ready);
    expect(onSessionForget).toHaveBeenCalledWith(ready);
  });

  it("offers no Forget when the ready machine is not saved on this device", () => {
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[session({ sessionId: "a-ready", phase: "ready" })]}
        onCreate={() => {}}
        onSessionAction={() => {}}
        onSessionForget={() => {}}
        canForgetSession={() => false}
      />,
    );
    expect(node.querySelector('button[aria-label="Forget this environment"]')).toBeNull();
  });

  it("shows a failed history row's reason and its Details link", () => {
    const detailsUrl = "https://nexplore.ghe.com/hive/nx-nexi/actions/runs/77";
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[
          session({
            sessionId: "h-failed",
            phase: "failed",
            failureReason: "Failed at “Start t3 serve”.",
            detailsUrl,
          }),
        ]}
        onCreate={() => {}}
        onSessionAction={() => {}}
      />,
    );
    expandHistory(node);

    expect(node.textContent).toContain("Failed at “Start t3 serve”.");
    const details = Array.from(node.querySelectorAll("a")).find(
      (anchor) => anchor.textContent === "Details",
    );
    expect(details?.getAttribute("href")).toBe(detailsUrl);
  });

  it("offers exactly one start affordance in the empty state — the header's", () => {
    const onCreate = vi.fn();
    const node = render(
      <CloudSessionProvisionPanel
        sessions={[session({ sessionId: "h-stopped", phase: "stopped", elapsedSeconds: 3600 })]}
        onCreate={onCreate}
        onSessionAction={() => {}}
      />,
    );

    expect(node.textContent).toContain("No active cloud sessions");
    const startButtons = Array.from(node.querySelectorAll("button")).filter((button) =>
      button.textContent?.includes("New session"),
    );
    expect(startButtons).toHaveLength(1);
    act(() => {
      startButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreate).toHaveBeenCalledTimes(1);
    // Finished sessions still sit in the collapsed history.
    expect(node.textContent).toContain("History · 1");
  });

  it("shows the empty state with no history when there are no sessions at all", () => {
    const node = render(
      <CloudSessionProvisionPanel sessions={[]} onCreate={() => {}} onSessionAction={() => {}} />,
    );
    expect(node.textContent).toContain("No active cloud sessions");
    expect(node.textContent).not.toContain("History ·");
  });

  it("ticks the elapsed label of an in-progress session on the client", () => {
    // The server snapshot says 2m 35s elapsed; without a client-side tick the
    // label would sit there frozen until the next (minutes-away) refresh.
    vi.useFakeTimers();
    try {
      const node = render(
        <CloudSessionProvisionPanel
          sessions={[
            session({ sessionId: "a-preparing", phase: "preparing", elapsedSeconds: 155 }),
          ]}
          onCreate={() => {}}
          onSessionAction={() => {}}
        />,
      );

      expect(node.textContent).toContain("Installing dependencies and building · 2m 35s");
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(node.textContent).toContain("Installing dependencies and building · 2m 38s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not tick the label of a finished session", () => {
    vi.useFakeTimers();
    try {
      const node = render(
        <CloudSessionProvisionPanel
          sessions={[
            session({
              sessionId: "h-failed",
              phase: "failed",
              elapsedSeconds: 128,
              failureReason: "rejected",
            }),
          ]}
          onCreate={() => {}}
          onSessionAction={() => {}}
        />,
      );

      expandHistory(node);
      const before = node.textContent;
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      // No interval was registered for the terminal row: identical text.
      expect(node.textContent).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
