import { beforeEach, describe, expect, it } from "vite-plus/test";

import { getDraftCloudQueuedSend, retryDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import {
  BOUND_MS,
  HOUR,
  T0,
  flusher,
  kinds,
  queueDraft,
  resetDraftWorld,
} from "./t3team-cloudQueuedSendProjectBoundHarness";

beforeEach(resetDraftWorld);

describe("the bound and the machine's own bookkeeping", () => {
  it("late settings: the bound is absolute, so reasons move but the verdict does not", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0, { reason: "machine-settings-pending" });
    // Settings arrive just before the bound: still waiting, now on the project list.
    expect(f.tick("d1", T0 + BOUND_MS - 1, { reason: "project-list-pending" }).kind).toBe("wait");
    // Exactly at it: given up, naming what was missing then.
    expect(f.tick("d1", T0 + BOUND_MS, { reason: "project-list-pending" })).toMatchObject({
      kind: "fail",
      failure: { kind: "project_not_resolved", reason: "project-list-pending" },
    });
  });

  it("late settings after the bound: parked on machine-settings-pending, retry gets a fresh bound", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0, { reason: "machine-settings-pending" });
    f.tick("d1", T0 + BOUND_MS, { reason: "machine-settings-pending" });
    expect(getDraftCloudQueuedSend("d1")!.failureReason).toBe("machine-settings-pending");
    // The settings arrive a second later, too late for this attempt; the user retries.
    retryDraftCloudQueuedSend("d1");
    const later = T0 + BOUND_MS + 1_000;
    expect(f.tick("d1", later, { reason: "project-list-pending" }).kind).toBe("wait");
    // A stale stamp would have failed that retry at once; the new bound counts from the retry.
    expect(f.tick("d1", later + BOUND_MS - 1, { reason: "project-list-pending" }).kind).toBe(
      "wait",
    );
    expect(f.tick("d1", later + BOUND_MS, { reason: "project-list-pending" }).kind).toBe("fail");
  });

  it("an app restart mid-wait counts from the original stamp, after the machine has settled", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    f.restart();
    const relaunch = T0 + 2 * HOUR;
    // The stamp survived (it is on the draft): no fresh 180 s, only the settle period.
    expect(f.tick("d1", relaunch).kind).toBe("wait");
    expect(f.tick("d1", relaunch + 29_000).kind).toBe("wait");
    expect(f.tick("d1", relaunch + 30_000).kind).toBe("fail");
    expect(getDraftCloudQueuedSend("d1")!.messageText).toBe("deploy the preview");
  });

  it("a wall clock set back is clamped, so the bound is not held open for the whole jump", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    const back = T0 - 24 * HOUR;
    // On a stale future stamp this would wait 24 h + 180 s.
    expect(f.tick("d1", back).kind).toBe("wait");
    expect(getDraftCloudQueuedSend("d1")!.stepStartedAt!.project).toBe(
      new Date(back).toISOString(),
    );
    expect(f.tick("d1", back + BOUND_MS - 1).kind).toBe("wait");
    expect(f.tick("d1", back + BOUND_MS).kind).toBe("fail");
  });

  it("a wall clock set forward fails it once the machine has been seen connected a while", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    f.tick("d1", T0 + 60_000);
    expect(f.tick("d1", T0 + 24 * HOUR).kind).toBe("fail");
  });

  it("machine flapping does not reset the bound", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    f.tick("d1", T0 + 100_000, { connected: false });
    expect(f.tick("d1", T0 + 150_000).kind).toBe("wait");
    // Reset on reconnect would give 150 s + 180 s; the stamp says 180 s.
    expect(f.tick("d1", T0 + BOUND_MS).kind).toBe("fail");
  });

  it("two queued sends for one project: each has its own bound, both are kept, both resolve together", () => {
    queueDraft("d1", "project-a");
    queueDraft("d2", "project-b");
    const f = flusher();
    f.tick("d1", T0);
    f.tick("d2", T0 + 60_000);
    // Failure follows each send's own stamp: the later one is not cut short by the earlier.
    expect(f.tick("d1", T0 + BOUND_MS).kind).toBe("fail");
    expect(f.tick("d2", T0 + BOUND_MS).kind).toBe("wait");
    expect(f.tick("d2", T0 + 60_000 + BOUND_MS).kind).toBe("fail");
    expect(getDraftCloudQueuedSend("d1")!.failureKind).toBe("project_not_resolved");
    expect(getDraftCloudQueuedSend("d2")!.failureKind).toBe("project_not_resolved");
    // The project is a fact about the machine, not about a send: when it appears both go.
    queueDraft("d3", "project-c");
    queueDraft("d4", "project-d");
    f.tick("d3", T0 + HOUR);
    f.tick("d4", T0 + HOUR);
    const world = { projectId: "app-own" };
    expect(
      kinds([f.tick("d3", T0 + HOUR + 10_000, world), f.tick("d4", T0 + HOUR + 10_000, world)]),
    ).toEqual(["dispatch", "dispatch"]);
  });
});
