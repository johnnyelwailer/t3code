// @effect-diagnostics preferSchemaOverJson:off - pack manifest fixtures are intentionally compact JSON.
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { CompletionWakeRenderInput } from "@t3team/pack-api";
import { RunId, ThreadId, type OrchestrationV2Subagent } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { afterEach } from "vite-plus/test";

import {
  ProjectionStoreV2,
  type ProjectionStoreV2Shape,
} from "./orchestration-v2/ProjectionStore.ts";
import {
  loadPackCompletionWakeRenderer,
  packCompletionWakeRendererLive,
  setPackCompletionWakeRenderer,
} from "./t3team-pack-completionWakeRenderer.ts";
import { inspectConfiguredWorkspacePacks } from "./t3team-pack-host.ts";
import { DelegatedCompletionWakeRenderer } from "./t3team-v2/t3team-delegatedCompletionWakeRenderer.ts";

const subagent = (id: string, status: OrchestrationV2Subagent["status"], result: string | null) =>
  ({
    id,
    childThreadId: `thread:child-${id}`,
    title: `Task ${id}`,
    status,
    result,
  }) as unknown as OrchestrationV2Subagent;

const projections = Layer.succeed(ProjectionStoreV2, {
  getThreadRecords: () =>
    Effect.succeed({
      subagents: [
        subagent("node:a", "completed", "All tests pass."),
        subagent("node:b", "failed", null),
        subagent("node:other", "running", null),
      ],
    }),
} as unknown as ProjectionStoreV2Shape);

const render = Effect.gen(function* () {
  const renderer = yield* DelegatedCompletionWakeRenderer;
  return yield* renderer.render({
    threadId: ThreadId.make("thread:parent"),
    parentRunId: RunId.make("run:parent"),
    taskIds: ["node:a", "node:b"],
    defaultText: "Delegated tasks node:a, node:b reached terminal states.",
  });
}).pipe(Effect.provide(packCompletionWakeRendererLive.pipe(Layer.provide(projections))));

afterEach(() => setPackCompletionWakeRenderer(undefined));

it.effect("keeps the host text when no pack registered a renderer", () =>
  Effect.gen(function* () {
    assert.equal(yield* render, "Delegated tasks node:a, node:b reached terminal states.");
  }),
);

it.effect("lets the pack render the wake from the woken tasks", () =>
  Effect.gen(function* () {
    const seen: Array<CompletionWakeRenderInput> = [];
    setPackCompletionWakeRenderer({
      render: (input) => {
        seen.push(input);
        return input.tasks.map((task) => `${task.title}: ${task.status}`).join("\n");
      },
    });
    assert.equal(yield* render, "Task node:a: completed\nTask node:b: failed");
    assert.deepEqual(seen[0]?.tasks[0], {
      taskId: "node:a",
      childThreadId: "thread:child-node:a",
      title: "Task node:a",
      status: "completed",
      result: "All tests pass.",
    });
    assert.lengthOf(seen[0]?.tasks ?? [], 2);
  }),
);

const failingRenderers: ReadonlyArray<readonly [string, () => string | Promise<string>]> = [
  ["rejects", (): Promise<string> => Promise.reject(new Error("boom"))],
  ["returns no text", (): string => "  "],
];

it.effect.each(failingRenderers)(
  "falls back to the host text when the pack renderer %s",
  ([, failing]) =>
    Effect.gen(function* () {
      setPackCompletionWakeRenderer({ render: failing });
      assert.equal(yield* render, "Delegated tasks node:a, node:b reached terminal states.");
    }),
);

const loadWith = (capabilities: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-pack-wake-" });
    const directory = path.join(root, "example");
    yield* fileSystem.makeDirectory(directory);
    yield* fileSystem.writeFileString(
      path.join(directory, "activate.mjs"),
      "export const activate = ({ defineCompletionWakeRenderer }) => defineCompletionWakeRenderer({ render: (input) => input.defaultText });",
    );
    yield* fileSystem.writeFileString(
      path.join(directory, "pack.json"),
      JSON.stringify({
        id: "example",
        name: "Example",
        packApiVersion: 1,
        version: "1.0.0",
        scope: "distribution",
        compatibility: { t3teamCore: "*" },
        contents: {},
        capabilities,
        entrypoints: { activate: "activate.mjs" },
        hashes: {},
      }),
    );
    const diagnostic = yield* Effect.tryPromise(() => inspectConfiguredWorkspacePacks(root));
    return yield* Effect.exit(Effect.tryPromise(() => loadPackCompletionWakeRenderer(diagnostic)));
  });

it.layer(NodeServices.layer)("pack wake renderer loading", (it) => {
  it.effect("loads a renderer behind the completion-wake-renderer capability", () =>
    Effect.gen(function* () {
      const granted = yield* loadWith(["completion-wake-renderer:v1"]);
      assert.equal(granted._tag, "Success");
      if (granted._tag === "Success") assert.isFunction(granted.value?.render);
      const denied = yield* loadWith([]);
      assert.equal(denied._tag, "Failure");
    }),
  );
});
