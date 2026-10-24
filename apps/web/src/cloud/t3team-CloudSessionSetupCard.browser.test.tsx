import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { CLOUD_SETUP_READY_LINGER_MS, CloudSessionSetupHost } from "./t3team-CloudSessionSetupHost";

function session(overrides: Partial<CloudSession> = {}): CloudSession {
  return {
    sessionId: "session-1",
    providerKind: "github_actions",
    phase: "preparing",
    elapsedSeconds: 40,
    remainingSeconds: null,
    machineLabel: "ubuntu-slim",
    failureReason: null,
    detailsUrl: null,
    ...overrides,
  };
}

describe("CloudSessionSetupCard", () => {
  it("names the current step, gives a range and announces politely", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session(), machineConnected: false }}
        frozenElapsedSeconds={40}
      />,
      { router: false },
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-state")).toBe("working");
    expect(card.querySelector("[aria-current='step']")?.textContent).toContain(
      "Preparing your workspace",
    );
    expect(card.querySelector("[role='status']")?.textContent).toBe("Preparing your workspace.");
    const bar = card.querySelector("[role='progressbar']")!;
    expect(bar.getAttribute("aria-valuetext")).toMatch(/Preparing your workspace\. About/);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(card.querySelector("[role='status']")?.closest("[aria-busy='true']")).toBeNull();
    expect(card.querySelector("[data-cloud-setup-estimate]")?.textContent).toMatch(
      /min left|minute/,
    );
    expect(card.querySelector("[data-cloud-setup-note='meanwhile']")?.textContent).toContain(
      "type",
    );
  });

  it("says it is taking longer than usual, without a percentage or a countdown", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session({ elapsedSeconds: 400 }), machineConnected: false }}
        frozenElapsedSeconds={400}
      />,
      { router: false },
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-slow")).toBe("true");
    expect(card.querySelector("[data-cloud-setup-estimate]")?.textContent).toBe(
      "Taking longer than usual",
    );
    expect(card.querySelector("[role='progressbar']")?.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("explains repository setup for a project machine", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ projectMachine: true, machineStage: "building" }),
          machineConnected: false,
        }}
        frozenElapsedSeconds={100}
      />,
      { router: false },
    );
    expect(
      screen.container.querySelector("[data-cloud-setup-note='long-wait']")?.textContent,
    ).toContain("cloning");
  });

  it("honours forced still motion and the OS setting", async () => {
    await using still = await render(
      <CloudSessionSetupCard
        facts={{ session: session(), machineConnected: false }}
        motion="still"
        frozenElapsedSeconds={40}
      />,
      { router: false },
    );
    expect(
      still.container.querySelector("[data-cloud-setup-card]")?.getAttribute("data-motion"),
    ).toBe("still");
  });

  it("offers Try again on a failed session and calls it", async () => {
    const onTryAgain = vi.fn();
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ phase: "failed", failureReason: "Failed at “Checkout”." }),
          machineConnected: false,
        }}
        onTryAgain={onTryAgain}
      />,
      { router: false },
    );
    expect(screen.container.textContent).toContain("Failed at “Checkout”.");
    expect(screen.container.querySelector("[role='progressbar']")).toBeNull();
    const button = [...screen.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try again"),
    )!;
    await act(() => button.click());
    expect(onTryAgain).toHaveBeenCalledOnce();
  });

  it("lets a waiting message be cancelled, and not while it is being sent", async () => {
    const onCancel = vi.fn();
    const facts = { session: session(), machineConnected: false, delivery: "queued" as const };
    await using screen = await render(
      <CloudSessionSetupCard facts={facts} onCancel={onCancel} frozenElapsedSeconds={40} />,
      { router: false },
    );
    const cancel = [...screen.container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Cancel"),
    )!;
    await act(() => cancel.click());
    expect(onCancel).toHaveBeenCalledOnce();
    await screen.rerender(
      <CloudSessionSetupCard
        facts={{ ...facts, delivery: "sending" }}
        onCancel={onCancel}
        sending
        frozenElapsedSeconds={40}
      />,
    );
    expect(
      [...screen.container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Sending"),
      )?.disabled,
    ).toBe(true);
  });
});

describe("CloudSessionSetupHost", () => {
  it("shows nothing for a session that was already ready when the thread opened", async () => {
    await using screen = await render(
      <CloudSessionSetupHost
        facts={{ session: session({ phase: "ready" }), machineConnected: false }}
      />,
      { router: false },
    );
    expect(screen.container.querySelector("[data-cloud-setup-card]")).toBeNull();
  });

  it("says ready for a moment when the session becomes ready on screen, then goes", async () => {
    using _timers = fakeTimers();
    await using screen = await render(
      <CloudSessionSetupHost facts={{ session: session(), machineConnected: false }} />,
      { router: false },
    );
    expect(screen.container.querySelector("[data-state='working']")).not.toBeNull();
    await screen.rerender(
      <CloudSessionSetupHost
        facts={{ session: session({ phase: "ready" }), machineConnected: false }}
      />,
    );
    expect(screen.container.querySelector("[data-state='ready']")).not.toBeNull();
    await act(() => vi.advanceTimersByTime(CLOUD_SETUP_READY_LINGER_MS + 50));
    expect(screen.container.querySelector("[data-cloud-setup-card]")).toBeNull();
  });
});
