/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- handler unit test bridges Effect for plain assertion-style tests; no layer under test. */
import { type TaskRecord, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import {
  callT3TeamTaskJournalTool,
  isT3TeamTaskJournalTool,
  type TaskJournalStore,
} from "./t3team-toolBrokerBindingTaskJournal.ts";

const threadId = ThreadId.make("thread-journal");
const otherThreadId = ThreadId.make("thread-other");

/** In-memory stand-in for the SQLite repository, with the same whole-list
 * replace semantics: a write for one thread never touches another's list. */
function makeStore() {
  const byThread = new Map<string, ReadonlyArray<TaskRecord>>();
  const store: TaskJournalStore = {
    replaceForThread: ({ threadId: id, tasks }) =>
      Effect.sync(() => {
        byThread.set(id, tasks);
      }),
    listForThread: ({ threadId: id }) => Effect.succeed(byThread.get(id) ?? []),
  };
  return { store, byThread };
}

let idCounter = 0;

const run = (
  tool: string,
  toolArgs: unknown,
  overrides?: {
    readonly store?: TaskJournalStore | undefined;
    readonly threadId?: ThreadId | undefined;
  },
) =>
  Effect.runPromise(
    callT3TeamTaskJournalTool({
      tool,
      scopeLabel: "for this thread.",
      toolArgs,
      threadId: "threadId" in (overrides ?? {}) ? overrides?.threadId : threadId,
      store: "store" in (overrides ?? {}) ? overrides?.store : makeStore().store,
      now: () => "2026-09-11T00:00:00.000Z",
      makeId: () => `task-${++idCounter}`,
    }),
  );

const structured = (result: Awaited<ReturnType<typeof run>>) =>
  result.structuredContent as Record<string, unknown>;

describe("callT3TeamTaskJournalTool", () => {
  it("recognises both journal tool ids and nothing else", () => {
    expect(isT3TeamTaskJournalTool("t3team.task.write")).toBe(true);
    expect(isT3TeamTaskJournalTool("t3team.task.list")).toBe(true);
    expect(isT3TeamTaskJournalTool("t3team.thread.search")).toBe(false);
  });

  it("reports 'not enabled' when no store is wired", async () => {
    const result = await run("t3team.task.write", { tasks: [] }, { store: undefined });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("is not enabled for this thread.");
  });

  it("assigns 1-based dense positions from the array order", async () => {
    const { store } = makeStore();
    const result = await run(
      "t3team.task.write",
      {
        tasks: [
          { subject: "Add the migration", status: "completed" },
          { subject: "Wire the broker", status: "in_progress" },
          { subject: "Write the tests" },
        ],
      },
      { store },
    );
    expect(result.isError).toBeUndefined();
    const tasks = structured(result).tasks as ReadonlyArray<Record<string, unknown>>;
    expect(tasks.map((task) => task.position)).toEqual([1, 2, 3]);
    expect(tasks.map((task) => task.subject)).toEqual([
      "Add the migration",
      "Wire the broker",
      "Write the tests",
    ]);
    // Status defaults to pending when the agent omits it.
    expect(tasks[2]?.status).toBe("pending");
  });

  it("replaces the whole list rather than merging into the previous one", async () => {
    const { store, byThread } = makeStore();
    await run(
      "t3team.task.write",
      { tasks: [{ subject: "Old one" }, { subject: "Old two" }, { subject: "Old three" }] },
      { store },
    );
    await run("t3team.task.write", { tasks: [{ subject: "Only this" }] }, { store });

    const stored = byThread.get(threadId) ?? [];
    expect(stored.map((task) => task.subject)).toEqual(["Only this"]);
    expect(stored.map((task) => task.position)).toEqual([1]);

    const listed = await run("t3team.task.list", {}, { store });
    const tasks = structured(listed).tasks as ReadonlyArray<Record<string, unknown>>;
    expect(tasks).toHaveLength(1);
  });

  it("keeps a failure note instead of losing it", async () => {
    const { store } = makeStore();
    const result = await run(
      "t3team.task.write",
      {
        tasks: [
          {
            subject: "Run the migration",
            status: "pending",
            active_form: "Running the migration",
            note: "Failed once: sqlite locked by the dev server.",
          },
        ],
      },
      { store },
    );
    const task = (structured(result).tasks as ReadonlyArray<Record<string, unknown>>)[0];
    expect(task?.note).toBe("Failed once: sqlite locked by the dev server.");
    expect(task?.active_form).toBe("Running the migration");
  });

  it("returns an empty list with a hint for a thread that has no tasks", async () => {
    const { store } = makeStore();
    const result = await run("t3team.task.list", {}, { store });
    expect(result.isError).toBeUndefined();
    expect(structured(result).tasks).toEqual([]);
    expect(structured(result).hint).toContain("No tasks recorded for this thread yet");
  });

  it("keeps journals separate per thread", async () => {
    const { store } = makeStore();
    await run("t3team.task.write", { tasks: [{ subject: "Mine" }] }, { store });
    const other = await Effect.runPromise(
      callT3TeamTaskJournalTool({
        tool: "t3team.task.list",
        scopeLabel: "for this thread.",
        toolArgs: {},
        threadId: otherThreadId,
        store,
      }),
    );
    expect((other.structuredContent as Record<string, unknown>).tasks).toEqual([]);
  });

  it("rejects a non-array 'tasks' argument with a message that says what to send", async () => {
    const { store } = makeStore();
    const result = await run("t3team.task.write", { tasks: "Add the migration" }, { store });
    expect(result.isError).toBe(true);
    const message = result.content[0]?.text ?? "";
    expect(message).toContain("requires a 'tasks' ARRAY");
    expect(message).toContain("replaces the whole list");
  });

  it("rejects a missing subject and an unknown status, naming the index", async () => {
    const { store } = makeStore();
    const noSubject = await run("t3team.task.write", { tasks: [{ note: "orphan" }] }, { store });
    expect(noSubject.isError).toBe(true);
    expect(noSubject.content[0]?.text).toContain("tasks[0] requires a non-empty 'subject'");

    const badStatus = await run(
      "t3team.task.write",
      { tasks: [{ subject: "ok" }, { subject: "bad", status: "doing" }] },
      { store },
    );
    expect(badStatus.isError).toBe(true);
    expect(badStatus.content[0]?.text).toContain("tasks[1] has an unknown 'status'");
  });

  it("hints when more than one task is in_progress, but still stores the list", async () => {
    const { store, byThread } = makeStore();
    const result = await run(
      "t3team.task.write",
      {
        tasks: [
          { subject: "One", status: "in_progress" },
          { subject: "Two", status: "in_progress" },
        ],
      },
      { store },
    );
    expect(result.isError).toBeUndefined();
    expect(structured(result).hint).toContain("Keep exactly one in_progress");
    expect(byThread.get(threadId)).toHaveLength(2);
  });

  it("surfaces a store failure as a readable message", async () => {
    const failing: TaskJournalStore = {
      replaceForThread: () => Effect.fail("disk is full"),
      listForThread: () => Effect.fail("disk is full"),
    };
    const write = await run("t3team.task.write", { tasks: [{ subject: "x" }] }, { store: failing });
    expect(write.isError).toBe(true);
    expect(write.content[0]?.text).toContain(
      "Could not save this thread's task list: disk is full",
    );

    const list = await run("t3team.task.list", {}, { store: failing });
    expect(list.isError).toBe(true);
    expect(list.content[0]?.text).toContain("Could not read this thread's task list: disk is full");
  });
});
