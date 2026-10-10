import { assert, it } from "@effect/vitest";
import { RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  DelegatedCompletionWakeRenderer,
  renderDelegatedCompletionWake,
} from "./t3team-delegatedCompletionWakeRenderer.ts";

const input = {
  threadId: ThreadId.make("thread:parent"),
  parentRunId: RunId.make("run:parent"),
  taskIds: ["task-1"],
  defaultText: "Delegated task task-1 reached a terminal state.",
};

it.effect("defaults to upstream's text and lets an override render rich wakes", () =>
  Effect.gen(function* () {
    assert.strictEqual(
      yield* renderDelegatedCompletionWake(yield* DelegatedCompletionWakeRenderer, input),
      input.defaultText,
    );
    const rich = yield* renderDelegatedCompletionWake(
      { render: (wake) => Effect.succeed(`${wake.taskIds[0]} failed: tests broke`) },
      input,
    );
    assert.strictEqual(rich, "task-1 failed: tests broke");
  }),
);

it.effect("falls back to the default text when a renderer fails or dies", () =>
  Effect.gen(function* () {
    assert.strictEqual(
      yield* renderDelegatedCompletionWake({ render: () => Effect.die("boom") }, input),
      input.defaultText,
    );
  }),
);
