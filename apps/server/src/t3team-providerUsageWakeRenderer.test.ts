import { ProviderInstanceId, RunId, ThreadId, type ServerProvider } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach } from "vite-plus/test";

import {
  ProjectionStoreV2,
  type ProjectionStoreV2Shape,
} from "./orchestration-v2/ProjectionStore.ts";
import * as ProviderRegistry from "./provider/ProviderRegistry.ts";
import {
  packCompletionWakeRendererLive,
  setPackCompletionWakeRenderer,
} from "./t3team-pack-completionWakeRenderer.ts";
import { providerUsageWakeRendererLive } from "./t3team-providerUsageWakeRenderer.ts";
import { DelegatedCompletionWakeRenderer } from "./t3team-v2/t3team-delegatedCompletionWakeRenderer.ts";

const claudeId = ProviderInstanceId.make("claudeAgent");
const codexId = ProviderInstanceId.make("codex");

const provider = (instanceId: ProviderInstanceId, withUsage: boolean) =>
  ({
    instanceId,
    displayName: instanceId,
    enabled: true,
    ...(withUsage
      ? {
          usageLimits: {
            checkedAt: "2026-09-28T10:00:00.000Z",
            windows: [
              {
                id: "five_hour",
                kind: "session",
                label: "Session",
                usedPercent: 42,
                resetsAt: "2026-09-28T18:00:00.000Z",
              },
            ],
          },
        }
      : {}),
  }) as unknown as ServerProvider;

const CLAUDE_LINE = "claudeAgent: Session 42% (resets 2026-09-28 18:00 UTC) · severity: normal";

const task = (id: string, providerInstanceId: ProviderInstanceId) => ({ id, providerInstanceId });

const render = (input: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly tasks: ReadonlyArray<ReturnType<typeof task>>;
  readonly taskIds: ReadonlyArray<string>;
  readonly providersFail?: boolean;
}) => {
  const projections = Layer.succeed(ProjectionStoreV2, {
    getThreadRecords: () => Effect.succeed({ subagents: input.tasks }),
  } as unknown as ProjectionStoreV2Shape);
  const registry = Layer.succeed(ProviderRegistry.ProviderRegistry, {
    getProviders:
      input.providersFail === true ? Effect.die("registry down") : Effect.succeed(input.providers),
  } as unknown as ProviderRegistry.ProviderRegistry["Service"]);
  const layer = providerUsageWakeRendererLive.pipe(
    Layer.provide(packCompletionWakeRendererLive.pipe(Layer.provide(projections))),
    Layer.provide(Layer.merge(projections, registry)),
  );
  return Effect.gen(function* () {
    const renderer = yield* DelegatedCompletionWakeRenderer;
    return yield* renderer.render({
      threadId: ThreadId.make("thread:parent"),
      parentRunId: RunId.make("run:parent"),
      taskIds: input.taskIds,
      defaultText: "Delegated task node:a reached a terminal state.",
    });
  }).pipe(Effect.provide(layer));
};

afterEach(() => setPackCompletionWakeRenderer(undefined));

it.effect("appends the child instance's usage line to the default wake text", () =>
  Effect.gen(function* () {
    const text = yield* render({
      providers: [provider(claudeId, true), provider(codexId, true)],
      tasks: [task("node:a", claudeId)],
      taskIds: ["node:a"],
    });
    assert.equal(text, `Delegated task node:a reached a terminal state.\n\n${CLAUDE_LINE}`);
  }),
);

it.effect("adds one line per distinct instance and skips instances of other tasks", () =>
  Effect.gen(function* () {
    const text = yield* render({
      providers: [provider(claudeId, true), provider(codexId, true)],
      tasks: [task("node:a", claudeId), task("node:b", claudeId), task("node:c", codexId)],
      taskIds: ["node:a", "node:b"],
    });
    assert.equal(text.split("\n").filter((line) => line.startsWith("claudeAgent:")).length, 1);
    assert.notInclude(text, "codex:");
  }),
);

it.effect("leaves the text untouched when the child instance has no usage data", () =>
  Effect.gen(function* () {
    const text = yield* render({
      providers: [provider(claudeId, false)],
      tasks: [task("node:a", claudeId)],
      taskIds: ["node:a"],
    });
    assert.equal(text, "Delegated task node:a reached a terminal state.");
  }),
);

it.effect("leaves the text untouched when the usage read fails", () =>
  Effect.gen(function* () {
    const text = yield* render({
      providers: [],
      providersFail: true,
      tasks: [task("node:a", claudeId)],
      taskIds: ["node:a"],
    });
    assert.equal(text, "Delegated task node:a reached a terminal state.");
  }),
);

it.effect("appends over the pack renderer's text instead of replacing it", () =>
  Effect.gen(function* () {
    setPackCompletionWakeRenderer({ render: () => "Pack says: node:a done." });
    const text = yield* render({
      providers: [provider(claudeId, true)],
      tasks: [task("node:a", claudeId)],
      taskIds: ["node:a"],
    });
    assert.equal(text, `Pack says: node:a done.\n\n${CLAUDE_LINE}`);
  }),
);

it.effect("does not repeat a line the pack renderer already wrote", () =>
  Effect.gen(function* () {
    setPackCompletionWakeRenderer({ render: () => `node:a done.\n${CLAUDE_LINE}` });
    const text = yield* render({
      providers: [provider(claudeId, true)],
      tasks: [task("node:a", claudeId)],
      taskIds: ["node:a"],
    });
    assert.equal(text, `node:a done.\n${CLAUDE_LINE}`);
  }),
);
