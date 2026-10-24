import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { CLOUD_SETUP_READY_LINGER_MS, CloudSessionSetupHost } from "./t3team-CloudSessionSetupHost";
import { classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { CLOUD_SETUP_LOST_MESSAGE } from "./t3team-cloudSessionSetupProgress";
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
  it("names the current step, gives a labelled rough estimate and announces politely", async () => {
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
    const bar = card.querySelector("[role='progressbar']")!;
    expect(bar.getAttribute("aria-valuetext")).toMatch(/^Building workspace… About \d+ min left$/);
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    const fill = bar.querySelector<HTMLElement>("[data-cloud-setup-fill='determinate']");
    expect(Number.parseFloat(fill?.style.width ?? "100")).toBeLessThan(95);
    expect(card.querySelector("[role='status']")?.closest("[aria-busy='true']")).toBeNull();
    expect(card.querySelector("[data-cloud-setup-estimate]")?.textContent).toMatch(
      /min left|minute/,
    );
    expect(card.textContent).toContain("Rough estimate, not measured for this session");
    expect(card.querySelector("[data-cloud-setup-note='meanwhile']")?.textContent).toContain(
      "type",
    );
  });

  it("says it is taking longer than the rough estimate, without a percentage or a countdown", async () => {
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: session({ elapsedSeconds: 400 }), machineConnected: false }}
        frozenElapsedSeconds={400}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-slow")).toBe("true");
    expect(card.querySelector("[data-cloud-setup-estimate]")?.textContent).toBe(
      "Taking longer than the rough estimate",
    );
    const bar = card.querySelector("[role='progressbar']")!;
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toContain("Taking longer than the rough estimate");
    expect(bar.querySelector("[data-cloud-setup-fill='determinate']")).toBeNull();
    expect(bar.querySelector("[data-cloud-setup-fill='indeterminate']")).not.toBeNull();
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
      noRouter,
    );
    expect(
      screen.container.querySelector("[data-cloud-setup-note='long-wait']")?.textContent,
    ).toContain("cloning");
    expect(screen.container.querySelector("[data-cloud-setup-estimate]")?.textContent).toBe(
      "1m 40s so far",
    );
    expect(screen.container.textContent).not.toContain("Rough estimate");
    const bar = screen.container.querySelector("[role='progressbar']")!;
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toContain("1m 40s so far");
    expect(bar.querySelector("[data-cloud-setup-fill='determinate']")).toBeNull();
    expect(bar.querySelector("[data-cloud-setup-fill='indeterminate']")).not.toBeNull();
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

  it("names the problem when the session never showed up, and offers a fresh one", async () => {
    const onTryAgain = vi.fn();
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{ session: null, machineConnected: false, lost: true }}
        onTryAgain={onTryAgain}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.getAttribute("data-state")).toBe("failed");
    expect(card.textContent).toContain(CLOUD_SETUP_LOST_MESSAGE);
    expect(card.textContent).not.toContain("Waiting for");
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

describe("CloudSessionSetupCard project wait", () => {
  it("escalates from the project step's own start, not the session's age", async () => {
    const now = Date.parse("2026-10-24T12:00:00.000Z");
    const queued = decodeCloudQueuedSend({
      messageId: "msg-1",
      messageText: "hi",
      outgoingText: "hi",
      titleSeed: "hi",
      modelSelection: { instanceId: "codex", model: "gpt-5" },
      runtimeMode: "full-access",
      interactionMode: "default",
      sessionId: "session-1",
      sessionLabel: "machine",
      createdAt: new Date(now - 5_000).toISOString(),
      stepStartedAt: { project: new Date(now - 5_000).toISOString() },
    });
    const projectWait = classifyCloudProjectWait({
      environmentId: EnvironmentId.make("env-cloud"),
      scratch: false,
      machineSettingsLoaded: true,
      expectedCwd: "/workspace/app",
      scratchRoot: null,
      composer: null,
      projects: [],
    });
    using _timers = fakeTimers({ now });
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ phase: "ready", elapsedSeconds: 600 }),
          machineConnected: true,
          delivery: "queued",
          queued: queued ?? undefined,
          projectWait,
        }}
      />,
      noRouter,
    );
    const level = () =>
      screen.container
        .querySelector("[data-cloud-project-wait]")
        ?.getAttribute("data-cloud-project-wait") ?? "none";
    expect(level()).toBe("none");
    await act(() => vi.advanceTimersByTime(10_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(74_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(1_000));
    expect(level()).toBe("slow");
  });
});
