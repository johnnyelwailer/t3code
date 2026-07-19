import { describe, expect, it } from "vite-plus/test";

import {
  formatSleepingUntil,
  resolveProjectStatusIndicator,
  resolveThreadStatusPill,
} from "./t3work-projectSidebarShared";
import type { ProjectThread } from "~/t3work/t3work-types";

/** A minimal ProjectThread with just the fields the status pill reads. */
function makeThread(overrides: Partial<ProjectThread>): ProjectThread {
  return {
    id: "t1",
    projectId: "p1",
    title: "Weekly triage",
    messageCount: 0,
    lastMessageAt: "2026-06-14T00:00:00.000Z",
    createdAt: "2026-06-14T00:00:00.000Z",
    status: "idle",
    ...overrides,
  };
}

describe("resolveThreadStatusPill — sleeping (Epic 27)", () => {
  it("renders a clock-parked routine with a human due label", () => {
    const pill = resolveThreadStatusPill(
      makeThread({ status: "idle", sleepingUntil: "2026-06-15T09:00:00.000Z" }),
    );
    expect(pill?.label).toBe("Sleeping");
    expect(pill?.pulse).toBe(false);
    expect(pill?.detail).toMatch(/^Due /);
  });

  it("prefers the sleeping pill over the derived run status while parked", () => {
    // Even if a stale run status lingers, a set wake instant means the thread is dormant.
    const pill = resolveThreadStatusPill(
      makeThread({ status: "running", sleepingUntil: "2026-06-15T09:00:00.000Z" }),
    );
    expect(pill?.label).toBe("Sleeping");
  });

  it("falls back to the run status when no wake instant is set", () => {
    expect(resolveThreadStatusPill(makeThread({ status: "running" }))?.label).toBe("Working");
    expect(resolveThreadStatusPill(makeThread({ status: "idle" }))).toBeNull();
  });

  it("ranks a sleeping thread in the project status rollup", () => {
    const indicator = resolveProjectStatusIndicator([
      makeThread({ id: "a", status: "idle" }),
      makeThread({ id: "b", status: "idle", sleepingUntil: "2026-06-15T09:00:00.000Z" }),
    ]);
    expect(indicator?.label).toBe("Sleeping");
  });
});

describe("resolveThreadStatusPill — durable workflow run", () => {
  const at = "2026-06-14T08:00:00.000Z";

  it("shows a suspended agent turn as waiting, not running", () => {
    const pill = resolveThreadStatusPill(
      makeThread({
        status: "running",
        workflowRunStatus: {
          status: "suspended",
          pendingKind: "thread.turn",
          wakeAt: null,
          updatedAt: at,
        },
      }),
    );
    expect(pill?.label).toBe("Waiting for agent");
    expect(pill?.pulse).toBe(false);
    expect(pill?.detail).toMatch(/^Waiting since /);
  });

  it("uses plain durable labels for each terminal and scheduled state", () => {
    const queued = resolveThreadStatusPill(
      makeThread({
        workflowRunStatus: { status: "queued", pendingKind: null, wakeAt: null, updatedAt: at },
      }),
    );
    expect(queued?.label).toBe("Queued");
    expect(queued?.detail).toBe("Starts when capacity is free");
    expect(
      resolveThreadStatusPill(
        makeThread({
          workflowRunStatus: {
            status: "suspended",
            pendingKind: "user.input",
            wakeAt: null,
            updatedAt: at,
          },
        }),
      )?.label,
    ).toBe("Waiting for your answer");
    expect(
      resolveThreadStatusPill(
        makeThread({
          workflowRunStatus: {
            status: "sleeping",
            pendingKind: null,
            wakeAt: "2026-06-15T09:00:00.000Z",
            updatedAt: at,
          },
        }),
      )?.label,
    ).toBe("Scheduled");
    expect(
      resolveThreadStatusPill(
        makeThread({
          workflowRunStatus: {
            status: "completed",
            pendingKind: null,
            wakeAt: null,
            updatedAt: at,
          },
        }),
      )?.label,
    ).toBe("Complete");
    expect(
      resolveThreadStatusPill(
        makeThread({
          workflowRunStatus: { status: "failed", pendingKind: null, wakeAt: null, updatedAt: at },
        }),
      )?.label,
    ).toBe("Needs attention");
  });
});

describe("formatSleepingUntil", () => {
  const fixed = { now: new Date("2026-06-14T08:58:10.000Z"), locale: "en-US", timeZone: "UTC" };

  it("renders minutes remaining from an injected clock", () => {
    expect(formatSleepingUntil("2026-06-14T09:00:00.000Z", fixed)).toBe("Due in 2 min");
  });

  it("renders tomorrow's clock time from an injected clock", () => {
    expect(formatSleepingUntil("2026-06-15T09:00:00.000Z", fixed)).toBe("Due tomorrow at 9:00 AM");
  });

  it("keeps the next calendar day as tomorrow late in the day", () => {
    const late = { now: new Date("2026-06-14T20:00:00.000Z"), locale: "en-US", timeZone: "UTC" };
    expect(formatSleepingUntil("2026-06-15T09:00:00.000Z", late)).toBe("Due tomorrow at 9:00 AM");
  });

  it("uses calendar days across daylight-saving time", () => {
    const beforeDst = {
      now: new Date("2026-03-08T01:00:00.000Z"), // Mar 7, 8:00 PM EST
      locale: "en-US",
      timeZone: "America/New_York",
    };
    expect(formatSleepingUntil("2026-03-08T13:00:00.000Z", beforeDst)).toBe(
      "Due tomorrow at 9:00 AM",
    );
  });

  it("degrades gracefully for an unparseable instant", () => {
    expect(formatSleepingUntil("not-a-date")).toBe("Due later");
  });
});
