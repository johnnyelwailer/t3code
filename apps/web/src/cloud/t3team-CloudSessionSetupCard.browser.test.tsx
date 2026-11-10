import type { CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { CLOUD_SETUP_READY_LINGER_MS, CloudSessionSetupHost } from "./t3team-CloudSessionSetupHost";
import { CLOUD_SETUP_NOT_SEEN_NOTE } from "./t3team-cloudSessionSetupProgress";
import { CLOUD_SETUP_LOST_AFTER_MS, useCloudSessionLost } from "./t3team-useCloudSessionSetupCard";

/** The setup card renders no router links and reads no route, so it mounts without a router. */
const noRouter: { readonly router: false } = { router: false };

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
  it("keeps one progress indicator: the step list, without a bar, orb, or repeated step subtitle", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session(), machineConnected: false }}
        frozenElapsedSeconds={40}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-state")).toBe("working");
    expect(card.querySelector("[aria-current='step']")?.textContent).toContain(
      "Building workspace",
    );
    expect(card.querySelector("[role='status']")?.textContent).toBe("Building workspace…");
    expect(card.querySelector("[role='progressbar']")).toBeNull();
    expect(card.querySelector("[data-cloud-setup-estimate]")).toBeNull();
    expect(card.querySelector(".t3team-setup-orb")).toBeNull();
    expect(card.querySelectorAll("[data-cloud-setup-progress]")).toHaveLength(1);
    expect(card.querySelector("[data-cloud-setup-progress='steps']")).not.toBeNull();
    // Visible body (outside the polite status) must not repeat the current step.
    const status = card.querySelector("[role='status']");
    const visibleWithoutStatus = [...card.querySelectorAll("h3, p, li, button, a")]
      .filter((node) => status === null || !status.contains(node))
      .map((node) => node.textContent ?? "")
      .join(" ");
    expect(visibleWithoutStatus.match(/Building workspace/g)?.length).toBe(1);
    expect(visibleWithoutStatus).not.toContain("Rough estimate");
    expect(card.querySelector("[data-cloud-setup-note='meanwhile']")?.textContent).toContain(
      "type",
    );
  });

  it("says it is taking longer than the rough estimate without a second progress UI", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session({ elapsedSeconds: 400 }), machineConnected: false }}
        frozenElapsedSeconds={400}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-slow")).toBe("true");
    expect(card.textContent).toContain("Taking longer than the rough estimate");
    expect(card.querySelector("[role='progressbar']")).toBeNull();
    expect(card.querySelector("[data-cloud-setup-estimate]")).toBeNull();
    expect(card.querySelectorAll("[data-cloud-setup-progress]")).toHaveLength(1);
  });

  it("explains repository setup for a project machine without an elapsed timer strip", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ projectMachine: true, machineStage: "building" }),
          machineConnected: false,
        }}
        frozenElapsedSeconds={100}
      />,
      noRouter,
    );
    expect(
      screen.container.querySelector("[data-cloud-setup-note='long-wait']")?.textContent,
    ).toContain("Cloning");
    expect(screen.container.textContent).not.toContain("Rough estimate");
    expect(screen.container.textContent).not.toContain("1m 40s so far");
    expect(screen.container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("only says everything is in place once the machine is connected", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session({ phase: "ready" }), machineConnected: false }}
      />,
      noRouter,
    );
    expect(screen.container.textContent).not.toContain("Everything is in place");
    expect(screen.container.textContent).toContain("Send your first message to connect");
    await screen.rerender(
      <CloudSessionSetupCard
        facts={{ session: session({ phase: "ready" }), machineConnected: true }}
      />,
    );
    expect(screen.container.textContent).toContain("Everything is in place");
  });

  it("says it is still waiting, not that it failed, when the session has not shown up", async () => {
    const onTryAgain = vi.fn();
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: null, machineConnected: false, lost: true }}
        onTryAgain={onTryAgain}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-state")).toBe("working");
    expect(card.getAttribute("data-not-seen")).toBe("true");
    expect(card.textContent).toContain(CLOUD_SETUP_NOT_SEEN_NOTE);
    expect(card.textContent).not.toContain("didn't finish");
    const button = [...card.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try again"),
    )!;
    await act(() => button.click());
    expect(onTryAgain).toHaveBeenCalledOnce();
  });

  it("honours forced still motion and the OS setting", async () => {
    await using still = await render(
      <CloudSessionSetupCard
        facts={{ session: session(), machineConnected: false }}
        motion="still"
        frozenElapsedSeconds={40}
      />,
      noRouter,
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
      noRouter,
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
      noRouter,
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
    // Visible copy keeps the cancel label only; no second "Sending to cloud session…" strip.
    expect(screen.container.querySelector("h3")?.textContent).not.toContain(
      "Sending to cloud session",
    );
    expect(screen.container.querySelector("[data-cloud-setup-note='meanwhile']")).toBeNull();
    expect(screen.container.querySelector("[role='status']")?.textContent).toBe(
      "Sending your message.",
    );
  });
});

describe("CloudSessionSetupHost", () => {
  it("shows nothing for a session that was already ready when the thread opened", async () => {
    await using screen = await render(
      <CloudSessionSetupHost
        facts={{ session: session({ phase: "ready" }), machineConnected: false }}
      />,
      noRouter,
    );
    expect(screen.container.querySelector("[data-cloud-setup-card]")).toBeNull();
  });

  it("shows nothing when the list arrives late with a session that is already ready", async () => {
    await using screen = await render(
      <CloudSessionSetupHost facts={{ session: null, machineConnected: false }} />,
      noRouter,
    );
    await screen.rerender(
      <CloudSessionSetupHost
        facts={{ session: session({ phase: "ready" }), machineConnected: false }}
      />,
    );
    expect(screen.container.querySelector("[data-cloud-setup-card]")).toBeNull();
  });

  it("says ready for a moment when the session becomes ready on screen, then goes", async () => {
    using _timers = fakeTimers();
    await using screen = await render(
      <CloudSessionSetupHost facts={{ session: session(), machineConnected: false }} />,
      noRouter,
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

function LostProbe({ sessionId, missing }: { sessionId: string; missing: boolean }) {
  return <span>{useCloudSessionLost(sessionId, missing) ? "lost" : "waiting"}</span>;
}

describe("useCloudSessionLost", () => {
  it("gives a missing session a bounded wait, and forgets it once the session shows up", async () => {
    using _timers = fakeTimers();
    await using screen = await render(<LostProbe sessionId="session-1" missing />, noRouter);
    await act(() => vi.advanceTimersByTime(CLOUD_SETUP_LOST_AFTER_MS - 1_000));
    expect(screen.container.textContent).toBe("waiting");
    await act(() => vi.advanceTimersByTime(1_000));
    expect(screen.container.textContent).toBe("lost");
    await screen.rerender(<LostProbe sessionId="session-1" missing={false} />);
    expect(screen.container.textContent).toBe("waiting");
  });
});
