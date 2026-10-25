import { describe, expect, it, beforeEach } from "vite-plus/test";

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { CLOUD_PROJECT_WAIT_BOUND_SECONDS } from "./t3team-cloudProjectWaitBound";
import type { CloudQueuedSendFlushAction } from "./t3team-cloudQueuedSendFlush";
import { isCloudQueuedSendFailed } from "./t3team-cloudQueuedSendModel";
import {
  cancelDraftCloudQueuedSend,
  getDraftCloudQueuedSend,
  retryDraftCloudQueuedSend,
} from "./t3team-cloudQueuedSendStore";
import {
  BOUND_MS,
  ENV,
  HOUR,
  T0,
  flusher,
  kinds,
  queueDraft,
  resetDraftWorld,
} from "./t3team-cloudQueuedSendProjectBoundHarness";

beforeEach(resetDraftWorld);

describe("the 11 h 52 m case, replayed with an injected clock", () => {
  it("stays bounded: waits for the bound, then parks as project_not_resolved with the message kept", () => {
    queueDraft("d1");
    const f = flusher();
    const actions: CloudQueuedSendFlushAction[] = [];
    // Every 30 s for 12 h; the machine is connected throughout and the project never appears.
    for (let at = T0; at <= T0 + 12 * HOUR; at += 30_000) actions.push(f.tick("d1", at));
    const firstFail = actions.findIndex((a) => a.kind === "fail");
    // On main every tick is "wait": there is no fail at all.
    expect(firstFail * 30_000).toBe(BOUND_MS);
    expect(kinds(actions.slice(0, firstFail)).every((k) => k === "wait")).toBe(true);
    // Parked after that: the flusher goes quiet instead of failing again and again.
    expect(kinds(actions.slice(firstFail + 1)).every((k) => k === "wait")).toBe(true);
    const parked = getDraftCloudQueuedSend("d1")!;
    expect(parked).toMatchObject({
      messageText: "deploy the preview",
      outgoingText: "deploy the preview",
      failureKind: "project_not_resolved",
      failureReason: "project-list-pending",
      retryable: true,
    });
    expect(f.lines).toEqual([
      expect.objectContaining({
        outcome: "failed",
        environmentId: ENV,
        reason: "project-list-pending",
        elapsedSeconds: CLOUD_PROJECT_WAIT_BOUND_SECONDS,
      }),
    ]);
  });
});

describe("what ends the wait", () => {
  it("the project appearing exactly at the bound wins over the bound", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    expect(f.tick("d1", T0 + BOUND_MS - 1).kind).toBe("wait");
    expect(f.tick("d1", T0 + BOUND_MS, { projectId: "app-own" }).kind).toBe("dispatch");
    expect(isCloudQueuedSendFailed(getDraftCloudQueuedSend("d1")!)).toBe(false);
  });

  it("a session that ends mid-wait stops it at once, with the ended outcome", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    const ended = f.tick("d1", T0 + 40_000, { phase: "stopped" });
    expect(ended).toMatchObject({ kind: "fail", retryable: false });
    expect(f.lines).toEqual([expect.objectContaining({ outcome: "ended", elapsedSeconds: 40 })]);
    expect(getDraftCloudQueuedSend("d1")).toMatchObject({ failureMessage: expect.any(String) });
    expect(getDraftCloudQueuedSend("d1")!.failureKind).toBeUndefined();
  });

  it("the attach's session_ended stops it before the polled list has caught up", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    // The list still says ready (it is polled); the connection is parked on session_ended.
    // On main this asks to connect again, for as long as the list is stale.
    expect(f.tick("d1", T0 + 10_000, { connected: false }).kind).toBe("connect");
    const action = f.tick("d1", T0 + 20_000, { connected: false, envEnded: true });
    expect(action).toMatchObject({ kind: "fail", retryable: false });
    expect(f.lines).toEqual([expect.objectContaining({ outcome: "ended", elapsedSeconds: 20 })]);
  });

  it("a No-project draft is unaffected: it still opens the scratch project, however long", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0, { scratch: true });
    expect(f.tick("d1", T0 + 5 * HOUR, { scratch: true }).kind).toBe("open-scratch");
  });

  it("cancelling during the wait hands the text back and leaves nothing to fail later", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    expect(cancelDraftCloudQueuedSend("d1")).not.toBeNull();
    expect(getDraftCloudQueuedSend("d1")).toBeNull();
    expect(useComposerDraftStore.getState().draftsByThreadKey["d1"]?.prompt).toBe(
      "deploy the preview",
    );
  });
});

describe("after the failure", () => {
  it("editing the draft while parked changes neither the kept message nor the failure; cancel merges both", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    f.tick("d1", T0 + BOUND_MS);
    useComposerDraftStore.getState().setPrompt(DraftId.make("d1"), "also run the tests");
    expect(getDraftCloudQueuedSend("d1")).toMatchObject({
      messageText: "deploy the preview",
      failureKind: "project_not_resolved",
    });
    cancelDraftCloudQueuedSend("d1");
    expect(useComposerDraftStore.getState().draftsByThreadKey["d1"]?.prompt).toBe(
      "deploy the preview\n\nalso run the tests",
    );
  });

  it("resending after the failure succeeds once the project has appeared", () => {
    queueDraft("d1");
    const f = flusher();
    f.tick("d1", T0);
    f.tick("d1", T0 + BOUND_MS);
    expect(f.tick("d1", T0 + BOUND_MS + 5_000, { projectId: "app-own" }).kind).toBe("wait");
    retryDraftCloudQueuedSend("d1");
    expect(f.tick("d1", T0 + BOUND_MS + 6_000, { projectId: "app-own" })).toEqual({
      kind: "dispatch",
      environmentId: ENV,
      projectId: "app-own",
    });
  });
});
