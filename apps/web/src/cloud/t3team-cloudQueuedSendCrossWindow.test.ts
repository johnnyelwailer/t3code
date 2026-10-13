// @vitest-environment jsdom
/**
 * Two windows = two module instances (each its own draft store and outbox tab id) sharing one
 * localStorage, the way two app windows share the persisted draft storage.
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { StartCloudQueuedTurn } from "./t3team-cloudQueuedSendDispatch";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";

const queued = decodeCloudQueuedSend({
  messageId: "msg-x",
  messageText: "ship it",
  outgoingText: "ship it",
  titleSeed: "ship it",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-9",
  sessionLabel: "machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

async function openWindow() {
  vi.resetModules();
  const drafts = await import("~/composerDraftStore");
  const store = await import("./t3team-cloudQueuedSendStore");
  const dispatch = await import("./t3team-cloudQueuedSendDispatch");
  await drafts.useComposerDraftStore.persist.rehydrate();
  const draftId = drafts.DraftId.make("draft-x");
  return {
    drafts,
    draftId,
    prompt: () => drafts.useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt ?? "",
    cancel: () => store.cancelDraftCloudQueuedSend(draftId),
    send: (startTurn: StartCloudQueuedTurn) =>
      dispatch.dispatchCloudQueuedSend({
        draftId,
        messageId: queued.messageId,
        environmentId: EnvironmentId.make("env-cloud"),
        projectId: ProjectId.make("project-cloud"),
        projectCwd: null,
        startTurn,
      }),
  };
}

/** Window A queues the draft's first message; window B then opens and loads it. */
async function twoWindowsWithQueuedSend() {
  const a = await openWindow();
  const store = a.drafts.useComposerDraftStore.getState();
  store.setProjectDraftThreadId(
    scopeProjectRef(EnvironmentId.make("env-local"), ProjectId.make("project-a")),
    a.draftId,
    { threadId: ThreadId.make("thread-x") },
  );
  store.setPrompt(a.draftId, "ship it");
  const { writeDraftCloudQueuedSend } = await import("./t3team-cloudQueuedSendStore");
  writeDraftCloudQueuedSend(a.draftId, queued);
  store.setPrompt(a.draftId, "");
  a.drafts.flushComposerDraftStorage();
  const b = await openWindow();
  expect(
    b.drafts.useComposerDraftStore.getState().draftsByThreadKey[b.draftId]?.cloudQueuedSend,
  ).toMatchObject({ messageId: queued.messageId });
  return { a, b };
}

// Each window re-imports the draft store: a cold transform can take several seconds.
describe("queued cloud send across two windows", { timeout: 60_000 }, () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("does not send a stale in-memory copy after the other window cancelled it", async () => {
    const { a, b } = await twoWindowsWithQueuedSend();
    expect(a.cancel()?.messageId).toBe(queued.messageId);
    const startTurn = vi.fn<StartCloudQueuedTurn>(async () => AsyncResult.success(undefined));
    expect(await b.send(startTurn)).toBe("skipped");
    expect(startTurn).not.toHaveBeenCalled();
    expect(a.prompt()).toBe("ship it");
  });

  it("keeps a long send's claim, so the other window cannot cancel it past the claim TTL", async () => {
    const { a, b } = await twoWindowsWithQueuedSend();
    vi.useFakeTimers();
    let release: () => void = () => {};
    const startTurn = vi.fn<StartCloudQueuedTurn>(
      () =>
        new Promise((resolve) => {
          release = () => resolve(AsyncResult.success(undefined));
        }),
    );
    const sending = a.send(startTurn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.cancel()).toBeNull();
    expect(b.prompt()).toBe("");
    release();
    expect(await sending).toBe("sent");
    expect(startTurn).toHaveBeenCalledTimes(1);
  });
});
