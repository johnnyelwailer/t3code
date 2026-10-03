import { assert, describe, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type OrchestrationProjectShell,
  type OrchestrationV2AppThread,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { T3TeamChildThreadMetadataError } from "./t3team-childThreadMetadata.ts";
import {
  makeDelegatedChildRecorder,
  type DelegatedChildRecorderDeps,
} from "./t3team-delegateTaskRecordChild.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";

const parentThread = {
  id: ThreadId.make("thread:parent"),
  projectId: ProjectId.make("project:a"),
  title: "Coordinator",
} as OrchestrationV2AppThread;
const childThreadId = ThreadId.make("thread:child");
const project = { title: "Project A", workspaceRoot: "/work/a" } as OrchestrationProjectShell;

const parentToolContext: T3TeamTurnToolContext = {
  surface: "t3team",
  tools: [{ id: "t3team.view.read", capabilities: ["read"] }],
  state: { view: { kind: "thread", ticketId: "T-7", displayMode: "embedded" } },
};

const makeDeps = (overrides: Partial<DelegatedChildRecorderDeps> = {}) => {
  const metadata: Array<unknown> = [];
  const facts: Array<unknown> = [];
  const contexts = new Map<string, T3TeamTurnToolContext>([[parentThread.id, parentToolContext]]);
  const deps: DelegatedChildRecorderDeps = {
    metadata: {
      upsert: (input) => Effect.sync(() => void metadata.push(input)),
      listByChildThreadIds: () => Effect.succeed([]),
    },
    facts: {
      upsert: (threadId, patch) =>
        Effect.sync(() => {
          facts.push({ threadId, patch });
          return { threadId, updatedAt: "now" };
        }),
    } as unknown as DelegatedChildRecorderDeps["facts"],
    loadProject: () => Effect.succeed(project),
    toolContexts: {
      get: (threadId) => Effect.succeed(contexts.get(threadId)),
      put: ({ threadId, toolContext }) =>
        Effect.sync(() => void (toolContext ? contexts.set(threadId, toolContext) : undefined)),
    },
    workflowLaunchThreadFor: undefined,
    ...overrides,
  };
  return { deps, metadata, facts, contexts };
};

describe("makeDelegatedChildRecorder", () => {
  it.effect("inherits the parent's ticket and gives the child the parent's tool context", () =>
    Effect.gen(function* () {
      const { deps, metadata, facts, contexts } = makeDeps();
      const notes = yield* makeDelegatedChildRecorder(deps)({
        parentThread,
        childThreadId,
        title: "Fix login",
        ticketId: undefined,
        environment: undefined,
      });
      assert.deepEqual(notes, []);
      assert.deepEqual(metadata, [
        { childThreadId, parentThreadId: parentThread.id, placementThreadId: null, ticketId: "T-7" },
      ]);
      assert.deepEqual(facts, []);
      const view = (contexts.get(childThreadId)?.state as { view: Record<string, unknown> }).view;
      assert.include(view, {
        kind: "thread",
        threadId: childThreadId,
        threadTitle: "Fix login",
        ticketId: "T-7",
        workspaceRoot: "/work/a",
        displayMode: "thread",
      });
    }),
  );

  it.effect("records an explicit ticket, workflow placement and a cross-environment fact", () =>
    Effect.gen(function* () {
      const { deps, metadata, facts } = makeDeps({
        workflowLaunchThreadFor: () => "thread:launcher",
      });
      const environment = { environmentId: EnvironmentId.make("env-2") };
      yield* makeDelegatedChildRecorder(deps)({
        parentThread,
        childThreadId,
        title: undefined,
        ticketId: "T-9",
        environment,
      });
      assert.deepEqual(metadata, [
        {
          childThreadId,
          parentThreadId: parentThread.id,
          placementThreadId: "thread:launcher",
          ticketId: "T-9",
        },
      ]);
      assert.deepEqual(facts, [{ threadId: childThreadId, patch: { environment } }]);
    }),
  );

  it.effect("writes nothing when there is no ticket or placement, and degrades failures to notes", () =>
    Effect.gen(function* () {
      const quiet = makeDeps({ toolContexts: undefined });
      yield* makeDelegatedChildRecorder(quiet.deps)({
        parentThread,
        childThreadId,
        title: undefined,
        ticketId: undefined,
        environment: undefined,
      });
      assert.deepEqual(quiet.metadata, []);

      const failing = makeDeps({
        metadata: {
          upsert: () =>
            Effect.fail(new T3TeamChildThreadMetadataError({ operation: "upsert", cause: "db" })),
          listByChildThreadIds: () => Effect.succeed([]),
        },
      });
      const notes = yield* makeDelegatedChildRecorder(failing.deps)({
        parentThread,
        childThreadId,
        title: undefined,
        ticketId: "T-1",
        environment: undefined,
      });
      assert.deepEqual(notes, ["Could not record the child's ticket; the child runs without it."]);
    }),
  );
});
