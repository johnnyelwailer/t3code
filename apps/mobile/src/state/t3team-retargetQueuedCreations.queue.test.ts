import { CommandId, EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { QueuedThreadMessage } from "./thread-outbox-model";

// The real outbox manager over memory storage; no delivery runs here.
const state = vi.hoisted(() => ({
  manager: null as unknown as ReturnType<
    typeof import("./thread-outbox-manager").createThreadOutboxManager
  >,
  follow: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock("./t3team-followRetargetedThreads", () => ({ followRetargetedThreads: state.follow }));
vi.mock("./thread-outbox", async () => {
  const { createThreadOutboxManager } = await import("./thread-outbox-manager");
  const { appAtomRegistry } = await import("./atom-registry");
  state.manager = createThreadOutboxManager({
    registry: appAtomRegistry,
    storage: {
      load: async () => ({ messages: [], errors: [] }),
      write: async () => {},
      remove: async () => {},
    },
  });
  return {
    threadOutboxManager: state.manager,
    threadOutboxRevision: (id: MessageId) => state.manager.revisionOf(id),
    updateThreadOutboxMessage: (message: QueuedThreadMessage, revision?: number) =>
      state.manager.update(message, revision),
  };
});
vi.mock("./use-thread-outbox", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    dispatchingQueuedMessageIdAtom: Atom.make<MessageId | null>(null).pipe(Atom.keepAlive),
  };
});

import { appAtomRegistry } from "./atom-registry";
import { dispatchingQueuedMessageIdAtom } from "./use-thread-outbox";
import { retargetQueuedCreation, retargetQueuedCreations } from "./t3team-retargetQueuedCreations";

const placeholder = {
  environmentId: EnvironmentId.make("pending-env"),
  projectId: ProjectId.make("pending-project"),
};
const real = { environmentId: EnvironmentId.make("machine"), projectId: ProjectId.make("repo") };

const creation = (id = "message", threadId = "new-thread", minute = 0): QueuedThreadMessage => ({
  environmentId: placeholder.environmentId,
  threadId: ThreadId.make(threadId),
  commandId: CommandId.make(`${id}-command`),
  messageId: MessageId.make(id),
  text: "Fix the build",
  attachments: [],
  creation: {
    projectId: placeholder.projectId,
    workspaceMode: "local",
    branch: null,
    worktreePath: null,
  },
  createdAt: `2026-11-09T00:0${minute}:00.000Z`,
});
const followUp = (id = "follow-up", minute = 1): QueuedThreadMessage => {
  const { creation: _creation, ...message } = creation(id, "new-thread", minute);
  return message;
};
const remaining = () =>
  Object.values(appAtomRegistry.get(state.manager.queuedMessagesByThreadKeyAtom)).flat();
const environmentsOf = () =>
  Object.fromEntries(remaining().map((message) => [message.messageId, message.environmentId]));

beforeEach(() => {
  state.follow.mockClear();
  appAtomRegistry.set(state.manager.queuedMessagesByThreadKeyAtom, {});
  appAtomRegistry.set(dispatchingQueuedMessageIdAtom, null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retargetQueuedCreations on the queue", () => {
  it("does not move a message that is being dispatched, and reports the move incomplete", async () => {
    await state.manager.enqueue(creation());
    appAtomRegistry.set(dispatchingQueuedMessageIdAtom, MessageId.make("message"));
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result.complete).toBe(false);
    expect(environmentsOf()).toEqual({ message: "pending-env" });
  });

  it("re-reads and retries a message whose revision changed during the move", async () => {
    await state.manager.enqueue(creation());
    vi.spyOn(state.manager, "update").mockResolvedValueOnce(false);
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result.complete).toBe(true);
    expect(environmentsOf()).toEqual({ message: "machine" });
  });

  it("reports a queue it could not read, without moving anything", async () => {
    await state.manager.enqueue(creation());
    vi.spyOn(state.manager, "load").mockResolvedValueOnce(false);
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result).toEqual({ complete: false, movedThreadIds: [] });
    expect(environmentsOf()).toEqual({ message: "pending-env" });
  });

  it("moves a follow-up left behind once its creation already moved (a retry)", async () => {
    await state.manager.enqueue(retargetQueuedCreation(creation(), placeholder, real)!);
    await state.manager.enqueue(followUp());
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result.complete).toBe(true);
    expect(environmentsOf()).toEqual({ message: "machine", "follow-up": "machine" });
  });

  it("moves a follow-up whose update lost its revision after its creation was delivered", async () => {
    await state.manager.enqueue(creation());
    await state.manager.enqueue(followUp());
    const update = state.manager.update;
    let followUpLost = false;
    vi.spyOn(state.manager, "update").mockImplementation(async (message, revision) => {
      if (message.messageId === "follow-up" && !followUpLost) {
        followUpLost = true;
        return false;
      }
      const updated = await update(message, revision);
      // Delivered and removed before the follow-up is re-read.
      if (message.creation !== undefined) await state.manager.remove(message);
      return updated;
    });
    const result = await retargetQueuedCreations(placeholder, real);
    expect(environmentsOf()).toEqual({ "follow-up": "machine" });
    expect(result.complete).toBe(true);
  });

  it("moves a message queued on the placeholder while the move ran", async () => {
    await state.manager.enqueue(creation());
    const update = state.manager.update;
    vi.spyOn(state.manager, "update").mockImplementationOnce(async (message, revision) => {
      await state.manager.enqueue(followUp("late", 2));
      return update(message, revision);
    });
    const result = await retargetQueuedCreations(placeholder, real);
    expect(environmentsOf()).toEqual({ message: "machine", late: "machine" });
    expect(result).toEqual({ complete: true, movedThreadIds: ["new-thread"] });
  });

  it("moves every task on the placeholder, which belongs to this draft alone", async () => {
    await state.manager.enqueue({
      ...creation("other", "other-thread"),
      creation: { ...creation().creation!, projectId: ProjectId.make("elsewhere") },
    });
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result.complete).toBe(true);
    expect(remaining()[0]).toMatchObject({
      environmentId: "machine",
      creation: { projectId: "repo" },
    });
  });

  it("reports a failed storage write as incomplete and keeps the threads that moved", async () => {
    await state.manager.enqueue(creation("a", "thread-a", 0));
    await state.manager.enqueue(creation("b", "thread-b", 1));
    const update = state.manager.update;
    vi.spyOn(state.manager, "update").mockImplementation(async (message, revision) => {
      if (message.messageId === "b") throw new Error("disk full");
      return update(message, revision);
    });
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result).toEqual({ complete: false, movedThreadIds: ["thread-a"] });
    expect(environmentsOf()).toEqual({ a: "machine", b: "pending-env" });
  });

  it("serializes overlapping calls so each moved message is written once", async () => {
    // Warm the lazily loaded hooks, so the overlapping call reaches its writes.
    await retargetQueuedCreations(
      { ...placeholder, environmentId: EnvironmentId.make("idle") },
      real,
    );
    await state.manager.enqueue(creation("a", "thread-a", 0));
    await state.manager.enqueue(creation("b", "thread-b", 1));
    const ids = [MessageId.make("a"), MessageId.make("b")];
    const before = ids.map((id) => state.manager.revisionOf(id));
    const update = state.manager.update;
    let first: Promise<unknown> = Promise.resolve();
    let second: Promise<unknown> = Promise.resolve();
    let writes = 0;
    vi.spyOn(state.manager, "update").mockImplementation(async (message, revision) => {
      writes += 1;
      if (writes === 1) {
        // A second call starts while the first call's first write is pending...
        second = retargetQueuedCreations(placeholder, real);
        for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
      } else if (writes === 2 && message.messageId === "a") {
        // ...and, unserialized, its stale write of "a" would land after the first call is done.
        await first;
      }
      return update(message, revision);
    });
    first = retargetQueuedCreations(placeholder, real);
    const results = (await Promise.all([first, first.then(() => second)])) as Array<{
      readonly complete: boolean;
    }>;
    expect(results.map((result) => result.complete)).toEqual([true, true]);
    expect(ids.map((id) => state.manager.revisionOf(id))).toEqual(
      before.map((revision) => revision + 1),
    );
  });

  it("checks for a dispatch before each message, not once per pass", async () => {
    await state.manager.enqueue(creation());
    await state.manager.enqueue(followUp());
    const update = state.manager.update;
    vi.spyOn(state.manager, "update").mockImplementation(async (message, revision) => {
      const updated = await update(message, revision);
      if (message.creation !== undefined) {
        appAtomRegistry.set(dispatchingQueuedMessageIdAtom, MessageId.make("follow-up"));
      }
      return updated;
    });
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result.complete).toBe(false);
    expect(environmentsOf()).toEqual({ message: "machine", "follow-up": "pending-env" });
  });

  it("follows a thread an earlier call moved once a later call finds nothing left", async () => {
    await state.manager.enqueue(creation());
    await state.manager.enqueue(followUp());
    appAtomRegistry.set(dispatchingQueuedMessageIdAtom, MessageId.make("follow-up"));
    expect((await retargetQueuedCreations(placeholder, real)).complete).toBe(false);
    expect(state.follow).toHaveBeenLastCalledWith("pending-env", "machine", []);

    // The leftover follow-up is edited back into a draft, leaving nothing on the placeholder.
    appAtomRegistry.set(dispatchingQueuedMessageIdAtom, null);
    await state.manager.remove(remaining().find((message) => message.messageId === "follow-up")!);
    const result = await retargetQueuedCreations(placeholder, real);
    expect(result).toEqual({ complete: true, movedThreadIds: ["new-thread"] });
    expect(state.follow).toHaveBeenLastCalledWith("pending-env", "machine", ["new-thread"]);

    await retargetQueuedCreations(placeholder, real);
    expect(state.follow).toHaveBeenLastCalledWith("pending-env", "machine", []);
  });
});
