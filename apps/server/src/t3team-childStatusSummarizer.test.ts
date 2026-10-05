import { assert, describe, it } from "@effect/vitest";
import {
  type OrchestrationV2TurnItem,
  ProviderInstanceId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { TestClock } from "effect/testing";

import {
  appendRecentActivity,
  type ChildActivity,
  makeChildStatusSummarizer,
  parseChildStatus,
  turnItemActivity,
} from "./t3team-childStatusSummarizer.ts";

const at = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z");
const base = {
  threadId: ThreadId.make("thread:child"),
  runId: RunId.make("run:1"),
  nodeId: null,
  providerTurnId: null,
  parentItemId: null,
  ordinal: 1,
  title: null,
  startedAt: at,
  completedAt: at,
  updatedAt: at,
};
const item = (over: Record<string, unknown>) =>
  ({ ...base, id: TurnItemId.make(`item:${over.type}`), status: "completed", ...over }) as never;

describe("child status helpers", () => {
  it("keeps only plausible single-line statuses", () => {
    assert.strictEqual(parseChildStatus({ status: "  Running   the tests " }), "Running the tests");
    assert.isNull(parseChildStatus({ status: "ok" }));
    assert.isNull(parseChildStatus({ status: "x".repeat(97) }));
    assert.isNull(parseChildStatus({ status: "bad\u0007bell" }));
    assert.isNull(parseChildStatus(["Running"]));
    assert.isNull(parseChildStatus(null));
  });

  it("summarizes finished tool work and skips running or streaming items", () => {
    const command: OrchestrationV2TurnItem = item({
      type: "command_execution",
      input: "pnpm  test",
    });
    assert.deepStrictEqual(turnItemActivity(command), {
      itemId: "item:command_execution",
      kind: "command_execution",
      summary: "pnpm test",
    });
    assert.strictEqual(
      turnItemActivity(item({ type: "file_change", fileName: "src/a.ts", status: "failed" }))
        ?.summary,
      "failed to change src/a.ts",
    );
    assert.isNull(
      turnItemActivity(item({ type: "command_execution", input: "ls", status: "running" })),
    );
    assert.isNull(
      turnItemActivity(
        item({ type: "assistant_message", text: "Hi", streaming: true, messageId: "m" }),
      ),
    );
    assert.isNull(
      turnItemActivity(item({ type: "reasoning", text: "thinking", streaming: false })),
    );
  });

  it("keeps the latest eight distinct items, refreshing a re-reported item", () => {
    let window: ReadonlyArray<ChildActivity> = [];
    for (let index = 0; index < 10; index += 1) {
      window = appendRecentActivity(window, {
        itemId: `i${index}`,
        kind: "k",
        summary: `s${index}`,
      });
    }
    window = appendRecentActivity(window, { itemId: "i3", kind: "k", summary: "again" });
    assert.deepStrictEqual(
      window.map((entry) => entry.itemId),
      ["i2", "i4", "i5", "i6", "i7", "i8", "i9", "i3"],
    );
  });
});

describe("makeChildStatusSummarizer", () => {
  const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt" };
  const activity = (summary: string): ReadonlyArray<ChildActivity> => [
    { itemId: summary, kind: "command_execution", summary },
  ];

  it.effect("debounces a burst into one generation over the latest activity", () =>
    Effect.gen(function* () {
      const generated: string[] = [];
      const persisted: Array<[string, string]> = [];
      const summarizer = yield* makeChildStatusSummarizer({
        debounce: "1500 millis",
        generate: (note) =>
          Effect.sync(() => {
            generated.push(note.activity.at(-1)!.summary);
            return { status: `Working on ${note.activity.at(-1)!.summary}` };
          }),
        persist: (threadId, status) => Effect.sync(() => void persisted.push([threadId, status])),
        onFailure: () => Effect.void,
      });
      for (const step of ["build", "lint", "tests"]) {
        yield* summarizer.note({ threadId: "child", modelSelection, activity: activity(step) });
        yield* TestClock.adjust("500 millis");
      }
      assert.deepStrictEqual(generated, []);
      yield* TestClock.adjust("1500 millis");
      assert.deepStrictEqual(generated, ["tests"]);
      assert.deepStrictEqual(persisted, [["child", "Working on tests"]]);
    }),
  );

  it.effect("reports failures and never persists an unusable answer", () =>
    Effect.gen(function* () {
      const failures: unknown[] = [];
      const persisted: string[] = [];
      const summarizer = yield* makeChildStatusSummarizer({
        debounce: "10 millis",
        generate: (note) =>
          note.threadId === "broken" ? Effect.fail("boom") : Effect.succeed({ status: "x" }),
        persist: (_threadId, status) => Effect.sync(() => void persisted.push(status)),
        onFailure: (threadId, error) => Effect.sync(() => void failures.push([threadId, error])),
      });
      yield* summarizer.note({ threadId: "broken", modelSelection, activity: activity("a") });
      yield* summarizer.note({ threadId: "terse", modelSelection, activity: activity("b") });
      yield* TestClock.adjust("20 millis");
      assert.deepStrictEqual(failures, [["broken", "boom"]]);
      assert.deepStrictEqual(persisted, []);
    }),
  );
});
