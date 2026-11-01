import { assert, describe, it } from "@effect/vitest";
import {
  ProjectId,
  T3TEAM_CONTEXT_BINDING_FACT_KEY,
  ThreadId,
  readThreadContextBinding,
  type T3TeamContextBinding,
} from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vite-plus/test";

import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { recordContextBinding } from "./t3team-contextBinding.ts";
import { mergeThreadFacts } from "./t3team-v2/t3team-threadFactsMerge.ts";
import * as ThreadFactsStore from "./t3team-v2/t3team-threadFactsStore.ts";

const KNOWN = ThreadId.make("thread:known");
const PROJECT = ProjectId.make("project-x");
const MY_WORK: T3TeamContextBinding = { version: 1, kind: "my-work", projectId: PROJECT };

const threads = {
  getThreadRecords: (threadId: ThreadId) =>
    threadId === KNOWN
      ? Effect.succeed({ thread: { id: KNOWN, projectId: PROJECT, deletedAt: null } })
      : Effect.fail("unknown thread"),
} as unknown as ThreadManagementService["Service"];
const projects = {
  getShell: (projectId: ProjectId) => Effect.succeedSome({ id: projectId }),
} as unknown as ProjectStore.ProjectStoreV2["Service"];

const TestLayer = ThreadFactsStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));

const record = (
  threadId: ThreadId,
  binding: T3TeamContextBinding,
  wrap: (store: ThreadFactsStore.T3TeamThreadFactsStore["Service"]) => typeof store = (store) =>
    store,
) =>
  Effect.gen(function* () {
    const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
    return yield* recordContextBinding({ threadId, binding }, wrap(store)).pipe(
      Effect.provideService(ThreadManagementService, threads),
      Effect.provideService(ProjectStore.ProjectStoreV2, projects),
    );
  });

/**
 * Both writers reach the store's write before either proceeds, so a read-then-write handler
 * always races. A writer that never arrives fails the test (the timeout is a defect, not
 * swallowed), and `arrivals` lets the test assert that both did.
 */
const bothWriteTogether = Effect.gen(function* () {
  const gate = yield* Deferred.make<void>();
  let arrivals = 0;
  const wait = Effect.suspend(() => {
    arrivals += 1;
    return arrivals >= 2 ? Deferred.succeed(gate, undefined) : Deferred.await(gate);
  }).pipe(Effect.timeout("5 seconds"), Effect.orDie);
  return {
    arrivals: () => arrivals,
    wrap: (store: ThreadFactsStore.T3TeamThreadFactsStore["Service"]) => ({
      ...store,
      upsert: (id: ThreadId, patch: Parameters<typeof store.upsert>[1]) =>
        wait.pipe(Effect.andThen(store.upsert(id, patch))),
    }),
  };
});

const storedBinding = (threadId: ThreadId) =>
  Effect.gen(function* () {
    const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
    return readThreadContextBinding((yield* store.get(threadId)) ?? undefined);
  });

describe("recordContextBinding", () => {
  beforeEach(() => replaceFeatureFlagPresetValues(new Map([["CONTEXT_CHAT_TAB", true]])));
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it.layer(TestLayer)("writes the thread fact", (it) => {
    it.effect("stores the binding under the fact key and reads it back", () =>
      Effect.gen(function* () {
        const result = yield* record(KNOWN, MY_WORK);
        assert.deepStrictEqual(result, { binding: MY_WORK });
        const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
        const facts = yield* store.get(KNOWN);
        assert.deepStrictEqual(facts?.extensions?.[T3TEAM_CONTEXT_BINDING_FACT_KEY], MY_WORK);
        assert.deepStrictEqual(yield* storedBinding(KNOWN), MY_WORK);
      }),
    );

    it.effect("accepts the same binding again and refuses a different one", () =>
      Effect.gen(function* () {
        yield* record(KNOWN, MY_WORK);
        yield* record(KNOWN, MY_WORK);
        const other: T3TeamContextBinding = { ...MY_WORK, kind: "project-dashboard" };
        const error = yield* Effect.flip(record(KNOWN, other));
        assert.strictEqual(error.message, "The thread is already bound to another context.");
        assert.deepStrictEqual(yield* storedBinding(KNOWN), MY_WORK);
      }),
    );
  });

  it.layer(TestLayer)("concurrent writes", (it) => {
    it.effect("lets only one of two concurrent conflicting writes win", () =>
      Effect.gen(function* () {
        const dashboard: T3TeamContextBinding = { ...MY_WORK, kind: "project-dashboard" };
        const gate = yield* bothWriteTogether;
        const results = yield* Effect.all(
          [record(KNOWN, MY_WORK, gate.wrap), record(KNOWN, dashboard, gate.wrap)].map((write) =>
            Effect.result(write),
          ),
          { concurrency: "unbounded" },
        );
        assert.strictEqual(gate.arrivals(), 2, "both writers reached the write before release");
        assert.strictEqual(results.filter((result) => result._tag === "Success").length, 1);
        const failure = results.find((result) => result._tag === "Failure");
        assert.strictEqual(
          failure?._tag === "Failure" ? failure.failure.message : "",
          "The thread is already bound to another context.",
        );
        const winner = results.find((result) => result._tag === "Success");
        assert.deepStrictEqual(
          yield* storedBinding(KNOWN),
          winner?._tag === "Success" ? winner.success.binding : null,
        );
      }),
    );
  });

  it.layer(TestLayer)("refusals store nothing", (it) => {
    it.effect.each([
      ["a newer version", { ...MY_WORK, version: 2, kind: "inbox" }],
      ["a malformed value", "my-work"],
    ])("never replaces a stored binding this build cannot read (%s)", ([, stored]) =>
      Effect.gen(function* () {
        const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
        yield* store.upsert(KNOWN, { extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: stored } });
        const error = yield* Effect.flip(record(KNOWN, MY_WORK));
        assert.strictEqual(
          error.message,
          "The thread has a context binding this version cannot read.",
        );
        const facts = yield* store.get(KNOWN);
        assert.deepStrictEqual(facts?.extensions?.[T3TEAM_CONTEXT_BINDING_FACT_KEY], stored);
      }),
    );

    it.effect("rejects an unknown thread", () =>
      Effect.gen(function* () {
        const ghost = ThreadId.make("thread:ghost");
        const error = yield* Effect.flip(record(ghost, MY_WORK));
        assert.strictEqual(error.message, "The thread was not found.");
        const store = yield* ThreadFactsStore.T3TeamThreadFactsStore;
        assert.isNull(yield* store.get(ghost));
      }),
    );

    it.effect("rejects a project that is not the thread's", () =>
      Effect.gen(function* () {
        const other: T3TeamContextBinding = { ...MY_WORK, projectId: ProjectId.make("project-y") };
        const error = yield* Effect.flip(record(KNOWN, other));
        assert.strictEqual(error.message, "The binding is for another project than the thread's.");
        assert.isNull(yield* storedBinding(KNOWN));
      }),
    );

    it.effect("rejects while CONTEXT_CHAT_TAB is off, before reading the thread", () =>
      Effect.gen(function* () {
        replaceFeatureFlagPresetValues(new Map([["CONTEXT_CHAT_TAB", false]]));
        const error = yield* Effect.flip(record(KNOWN, MY_WORK));
        assert.strictEqual(
          error.message,
          "Context chat tab is turned off on this host (Settings → Features).",
        );
        assert.isNull(yield* storedBinding(KNOWN));
      }),
    );
  });
});

describe("context binding fact merge", () => {
  const at = "2026-01-01T00:00:00.000Z";

  it("merges next to other extension keys and is a no-op when repeated", () => {
    const handoff = { "t3team.threadHandoff": { direction: "moved_to" } };
    const first = mergeThreadFacts(KNOWN, null, { extensions: handoff }, at);
    const bound = mergeThreadFacts(
      KNOWN,
      first,
      { extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: MY_WORK } },
      at,
    );
    assert.deepStrictEqual(bound?.extensions, {
      ...handoff,
      [T3TEAM_CONTEXT_BINDING_FACT_KEY]: MY_WORK,
    });
    assert.isNull(
      mergeThreadFacts(
        KNOWN,
        bound,
        { extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: { ...MY_WORK } } },
        "later",
      ),
    );
    assert.deepStrictEqual(readThreadContextBinding(bound ?? undefined), MY_WORK);
  });

  it("sets an extension only while the key is absent, whatever is stored there", () => {
    const patch = { extensionsIfAbsent: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: MY_WORK } };
    const bound = mergeThreadFacts(KNOWN, null, patch, at);
    assert.deepStrictEqual(bound?.extensions, { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: MY_WORK });
    assert.isNull(mergeThreadFacts(KNOWN, bound, patch, "later"));
    const newer = mergeThreadFacts(
      KNOWN,
      bound,
      { extensions: { [T3TEAM_CONTEXT_BINDING_FACT_KEY]: { version: 2 } } },
      at,
    );
    assert.isNull(mergeThreadFacts(KNOWN, newer, patch, "later"));
  });
});
