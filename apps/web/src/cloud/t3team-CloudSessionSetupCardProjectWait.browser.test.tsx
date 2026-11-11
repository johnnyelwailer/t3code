import { EnvironmentId, type CloudSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { act, fakeTimers, render } from "../../test/render";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";
import { classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { resetCloudProjectWaitLog } from "./t3team-cloudProjectWaitLog";

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

const SLOW_NOW = Date.parse("2026-10-24T12:10:00.000Z");
const PROJECT_STARTED = new Date(SLOW_NOW - 600_000).toISOString();

function queuedSend(overrides: Record<string, unknown> = {}) {
  return decodeCloudQueuedSend({
    messageId: "msg-slow",
    messageText: "hi",
    outgoingText: "hi",
    titleSeed: "hi",
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    sessionId: "session-1",
    sessionLabel: "machine",
    createdAt: PROJECT_STARTED,
    stepStartedAt: { project: PROJECT_STARTED },
    ...overrides,
  })!;
}

const projectListPending = classifyCloudProjectWait({
  environmentId: EnvironmentId.make("env-cloud"),
  scratch: false,
  machineSettingsLoaded: true,
  expectedCwd: "/workspace/app",
  scratchRoot: null,
  composer: null,
  projects: [],
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
    expect(screen.container.querySelector("[role='progressbar']")).toBeNull();
    expect(screen.container.querySelectorAll("[data-cloud-setup-progress]")).toHaveLength(1);
    await act(() => vi.advanceTimersByTime(10_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(74_000));
    expect(level()).toBe("expected");
    await act(() => vi.advanceTimersByTime(1_000));
    expect(level()).toBe("slow");
    expect(screen.container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("says plainly what a long wait is doing, keeps the diagnostic closed, and retries", async () => {
    resetCloudProjectWaitLog();
    const onRestartWait = vi.fn();
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({ phase: "ready", elapsedSeconds: 1_200 }),
          machineConnected: true,
          delivery: "queued",
          queued: queuedSend(),
          projectWait: projectListPending,
        }}
        onRestartWait={onRestartWait}
        frozenNowMs={SLOW_NOW}
        frozenElapsedSeconds={1_200}
      />,
      noRouter,
    );
    const note = screen.container.querySelector("[data-cloud-project-wait='slow']")!;
    expect(note.textContent).toContain(
      "This is taking longer than usual. Still connecting to the cloud machine.",
    );
    expect(note.textContent).not.toContain("=");
    expect(note.textContent).not.toContain("Not yet true");
    // The line under the title must not promise "now" while the note says it is still connecting.
    expect(screen.container.textContent).not.toContain("will send now");
    expect(screen.container.textContent).toContain(
      "Your message sends as soon as the machine is ready.",
    );
    expect(screen.container.querySelector("[data-cloud-project-wait-diagnostic]")).toBeNull();
    await page.getByRole("button", { name: "Details" }).click();
    await expect
      .element(page.getByText("project-wait reason=project-list-pending", { exact: false }))
      .toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    expect(onRestartWait).toHaveBeenCalledOnce();
  });

  it("gives a send that stopped waiting one primary Retry and puts the rest in the overflow", async () => {
    const onRetry = vi.fn();
    const onCancel = vi.fn();
    const onMachineProject = vi.fn();
    await using screen = await render(
      <CloudSessionSetupCard
        facts={{
          session: session({
            phase: "ready",
            elapsedSeconds: 1_200,
            detailsUrl: "https://example.test/run",
          }),
          machineConnected: true,
          delivery: "queued",
          queued: queuedSend({
            failureMessage: "The cloud machine hasn't opened “app” yet. Your message is saved.",
            retryable: true,
            failureKind: "project_not_resolved",
            failureReason: "project-list-pending",
          }),
          sendFailure: "The cloud machine hasn't opened “app” yet. Your message is saved.",
        }}
        onRetry={onRetry}
        onCancel={onCancel}
        recoveryActions={[
          {
            id: "machine-project",
            label: "Send in the machine's project",
            onClick: onMachineProject,
          },
        ]}
      />,
      noRouter,
    );
    const card = screen.container.querySelector("[data-cloud-setup-card]")!;
    expect(card.querySelector("h3")?.textContent).toBe("Still setting up");
    // Not alarming: a kept message that only ran out of waiting gets a calm icon, not the alert.
    expect(card.querySelector("[data-cloud-setup-calm]")).not.toBeNull();
    expect(card.textContent).toContain("Your message is saved.");
    expect(card.textContent).not.toContain("did not appear");
    const primary = card.querySelectorAll("[data-cloud-setup-action='primary']");
    expect(primary).toHaveLength(1);
    expect(primary[0]?.textContent).toBe("Retry");
    // Everything else: the ⋯ and nothing more, so the card has two buttons in total.
    expect(card.querySelectorAll("button")).toHaveLength(2);
    await page.getByRole("button", { name: "More options" }).click();
    for (const label of ["Send in the machine's project", "Cancel message", "See what happened"]) {
      await expect.element(page.getByRole("menuitem", { name: label })).toBeVisible();
    }
    await page.getByRole("menuitem", { name: "Send in the machine's project" }).click();
    expect(onMachineProject).toHaveBeenCalledOnce();
    await page.getByRole("button", { name: "Retry" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
