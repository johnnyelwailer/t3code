/**
 * start_child auto-latest model routing (`NEXI_FF_AUTO_LATEST_MODEL`, default ON): a stale
 * requested slug is routed to the newest model the target provider's live catalog reports
 * BEFORE the child thread is created, and the launch result records requested vs effective.
 *
 * Drives the real `makeStartChildThread` flow (same harness shape as
 * `t3team-toolBrokerStartChildEnvironment.test.ts`) so the assertion is on the dispatched
 * `thread.create` command — the model the child actually runs on.
 */
import {
  ThreadId,
  type ModelSelection,
  type OrchestrationThread,
  type ServerProvider,
} from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import * as Effect from "effect/Effect";

import {
  AUTO_LATEST_MODEL_FLAG_ENV,
  isAutoLatestModelEnabled,
} from "./t3team-autoLatestModelFlag.ts";
import { makeStartChildThread } from "./t3team-toolBrokerStartChild.ts";

const makeProvider = (instanceId: string, modelSlugs: ReadonlyArray<string>): ServerProvider =>
  ({
    instanceId,
    driver: instanceId,
    enabled: true,
    installed: true,
    models: modelSlugs.map((slug) => ({ slug, name: slug, isCustom: false, capabilities: null })),
  }) as unknown as ServerProvider;

const providers = [
  makeProvider("anthropic", ["claude-opus-4-8", "claude-opus-5-5", "claude-sonnet-5"]),
  makeProvider("openai", ["gpt-5.6-sol", "gpt-6-sol", "gpt-6-astra"]),
];

function makeHarness() {
  const commands: unknown[] = [];
  const project = { id: "p1", title: "Project", workspaceRoot: "/tmp/project" };
  const thread = {
    id: ThreadId.make("parent-1"),
    projectId: "p1",
    title: "Parent",
    modelSelection: {
      instanceId: "anthropic",
      model: "claude-opus-4-8",
      options: [],
    } as unknown as ModelSelection,
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    worktreePath: null,
  } as unknown as OrchestrationThread;
  return {
    commands,
    startChild: makeStartChildThread({
      loadThreadProject: () => Effect.succeed({ project: project as never, thread }),
      orchestration: {
        dispatch: (command: unknown) => {
          commands.push(command);
          return Effect.void;
        },
      } as never,
      contextStore: { get: () => Effect.succeed(undefined), put: () => Effect.void },
      services: { listProviders: () => Effect.succeed(providers) },
    }),
  };
}

const createdModel = (commands: readonly unknown[]) =>
  (
    commands.find((command) => (command as { type?: string }).type === "thread.create") as
      | { modelSelection?: ModelSelection }
      | undefined
  )?.modelSelection;

const previousFlag = process.env[AUTO_LATEST_MODEL_FLAG_ENV];
// Pin the code default for every case; the flag-off case sets its own override.
beforeEach(() => {
  delete process.env[AUTO_LATEST_MODEL_FLAG_ENV];
});
afterEach(() => {
  if (previousFlag === undefined) delete process.env[AUTO_LATEST_MODEL_FLAG_ENV];
  else process.env[AUTO_LATEST_MODEL_FLAG_ENV] = previousFlag;
});

describe("isAutoLatestModelEnabled", () => {
  it("defaults ON; only 0/false opt out", () => {
    expect(isAutoLatestModelEnabled(() => undefined)).toBe(true);
    for (const on of ["1", "true", "on", " TRUE ", ""]) {
      expect(
        isAutoLatestModelEnabled(() => on),
        on,
      ).toBe(true);
    }
    for (const off of ["0", "false", " False "]) {
      expect(
        isAutoLatestModelEnabled(() => off),
        off,
      ).toBe(false);
    }
  });
});

describe("start_child auto-latest model routing", () => {
  effectIt.effect("routes a stale same-provider slug and records requested vs effective", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        model: "claude-opus-4-8",
      });
      expect(createdModel(commands)).toMatchObject({
        instanceId: "anthropic",
        model: "claude-opus-5-5",
      });
      expect(result).toMatchObject({
        provider: "anthropic",
        model: "claude-opus-5-5",
        model_routing: {
          requested: "claude-opus-4-8",
          effective: "claude-opus-5-5",
          routed: true,
          reason: "same-tier-newer",
        },
      });
      // The routing record explains the change; it is not an alias normalization.
      expect(result).not.toHaveProperty("model_normalized_from");
    }),
  );

  effectIt.effect("routes a stale cross-provider slug the catalog no longer lists", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      // Without routing this fails: `gpt-5.5-sol` is not in the openai catalog.
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        provider: "openai",
        model: "gpt-5.5-sol",
      });
      expect(createdModel(commands)).toMatchObject({ instanceId: "openai", model: "gpt-6-sol" });
      expect(result.model_routing).toEqual({
        requested: "gpt-5.5-sol",
        effective: "gpt-6-sol",
        routed: true,
        reason: "same-tier-newer",
      });
    }),
  );

  effectIt.effect("records routed:false for an already-latest slug", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        provider: "openai",
        model: "gpt-6-astra",
      });
      expect(createdModel(commands)?.model).toBe("gpt-6-astra");
      expect(result.model_routing).toMatchObject({ routed: false, reason: "already-latest" });
    }),
  );

  effectIt.effect("flag off: runs the requested slug verbatim", () =>
    Effect.gen(function* () {
      process.env[AUTO_LATEST_MODEL_FLAG_ENV] = "false";
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
        model: "claude-opus-4-8",
      });
      expect(createdModel(commands)?.model).toBe("claude-opus-4-8");
      expect(result.model_routing).toMatchObject({ routed: false, reason: "flag-off" });
    }),
  );

  effectIt.effect("no requested model: inherits the parent model with no routing record", () =>
    Effect.gen(function* () {
      const { commands, startChild } = makeHarness();
      const result = yield* startChild(ThreadId.make("parent-1"), {
        name: "child",
        isolation: "shared",
      });
      expect(createdModel(commands)?.model).toBe("claude-opus-4-8");
      expect(result).not.toHaveProperty("model_routing");
    }),
  );
});
