/**
 * @vitest-environment jsdom
 *
 * Presentation tests for the roster row's status dot: a child thread that is
 * alive but WAITING on a background agent turn must read as alive (pulsing,
 * in the slower "waiting" motion), not as a static/stopped dot — while a
 * thread parked on a person (user input) stays still.
 */
import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectThread } from "~/t3team/t3team-types";
import { ThreadRow } from "./t3team-ProjectSidebarThreadRow";

const state = { isSelected: false, isOpen: false } as const;

function rowFor(thread: Partial<ProjectThread>): string {
  const full: ProjectThread = {
    id: "t1",
    projectId: "p1",
    title: "Watch the deploy",
    status: "running",
    createdAt: "2026-06-14T00:00:00.000Z",
    lastMessageAt: "2026-06-14T08:00:00.000Z",
    ...thread,
  };
  const element = (
    <ThreadRow
      thread={full}
      state={state}
      onSelect={() => {}}
      onDelete={() => {}}
      onRename={() => {}}
      wrapWithMenuItem={false}
    />
  );
  return renderToStaticMarkup(element);
}

describe("ThreadRow status dot — waiting on a background agent", () => {
  it("pulses the waiting dot with the slower waiting motion (alive, not stopped)", () => {
    const markup = rowFor({
      workflowRunStatus: {
        status: "suspended",
        pendingKind: "thread.turn",
        wakeAt: null,
        updatedAt: "2026-06-14T08:00:00.000Z",
      },
    });
    // The dot reads as the shared "waiting" orb state…
    expect(markup).toContain('data-t3team-state="waiting"');
    expect(markup).toContain("t3team-orb");
    // …and it is alive: the slower waiting pulse (never the active one, never static).
    expect(markup).toContain("animate-status-pulse-slow");
    expect(markup).not.toContain("animate-pulse ");
  });

  it('tooltips the wait with the what + how long: "Waiting for agent since …"', () => {
    const markup = rowFor({
      workflowRunStatus: {
        status: "suspended",
        pendingKind: "thread.turn",
        wakeAt: null,
        updatedAt: "2026-06-14T08:00:00.000Z",
      },
    });
    expect(markup).toContain('title="Waiting for agent since');
  });

  it("keeps a user-input wait static — parked on a person, not on work", () => {
    const markup = rowFor({
      workflowRunStatus: {
        status: "suspended",
        pendingKind: "user.input",
        wakeAt: null,
        updatedAt: "2026-06-14T08:00:00.000Z",
      },
    });
    expect(markup).toContain('title="Waiting for your answer');
    // No pulse class of any kind on this dot.
    expect(markup).not.toContain("animate-status-pulse");
    expect(markup).not.toContain("animate-pulse");
  });

  it("still shows the child status hint under the title", () => {
    const markup = rowFor({
      childStatus: "Monitoring the rollout",
      workflowRunStatus: {
        status: "suspended",
        pendingKind: "thread.turn",
        wakeAt: null,
        updatedAt: "2026-06-14T08:00:00.000Z",
      },
    });
    expect(markup).toContain('data-child-status="Monitoring the rollout"');
  });
});
