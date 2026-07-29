// New sibling test file (rather than extending threads-sync.test.ts) so this
// change stays additive: threads-sync.test.ts is an upstream-tracked file,
// and the additive guard whitelist for this change intentionally only adds
// packages/client-runtime/src/state/threads.ts. The harness below mirrors
// (duplicates, deliberately) the relevant slice of the one in
// threads-sync.test.ts.
import {
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotError,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThread,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadStreamItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";

import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as ConnectionWakeups from "../connection/wakeups.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as Persistence from "../platform/persistence.ts";
import * as RpcSession from "../rpc/session.ts";
import {
  EMPTY_ENVIRONMENT_THREAD_STATE,
  makeEnvironmentThreadState,
  ThreadSnapshotLoader,
  type EnvironmentThreadState,
} from "./threads.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const THREAD_ID = ThreadId.make("thread-1");
const PREPARED: PreparedConnection = {
  environmentId: TARGET.environmentId,
  label: TARGET.label,
  httpBaseUrl: TARGET.httpBaseUrl,
  socketUrl: TARGET.wsBaseUrl,
  httpAuthorization: null,
  target: TARGET,
};
const BASE_THREAD: OrchestrationThread = {
  id: THREAD_ID,
  projectId: ProjectId.make("project-1"),
  title: "Cached thread",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.4",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "main",
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  deletedAt: null,
  messages: [],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
};

type TestThreadInput = OrchestrationThreadStreamItem | Error;

function testSession(client: WsRpcProtocolClient): RpcSession.RpcSession {
  return {
    client,
    initialConfig: Effect.succeed({} as never),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

function awaitThreadState(
  observed: Queue.Queue<EnvironmentThreadState>,
  predicate: (state: EnvironmentThreadState) => boolean,
) {
  return Queue.take(observed).pipe(
    Effect.repeat({
      until: predicate,
    }),
  );
}

const makeHarness = Effect.fn("TestEnvironmentThreads.notFoundTerminal.makeHarness")(
  function* (options?: { readonly cached?: OrchestrationThread }) {
    const inputs = yield* Queue.unbounded<TestThreadInput>();
    const observed = yield* Queue.unbounded<EnvironmentThreadState>();
    const latest = yield* Ref.make<EnvironmentThreadState>(EMPTY_ENVIRONMENT_THREAD_STATE);
    const subscriptionCount = yield* Ref.make(0);
    const loaderCalls = yield* Ref.make(0);
    const removedThreads = yield* Ref.make<ReadonlyArray<ThreadId>>([]);
    const savedThreads = yield* Ref.make<ReadonlyArray<OrchestrationThreadDetailSnapshot>>([]);
    const wakeups = yield* Queue.unbounded<ConnectionWakeups.ConnectionWakeup>();
    const supervisorState = yield* SubscriptionRef.make<SupervisorConnectionState>(
      AVAILABLE_CONNECTION_STATE,
    );
    const streamFrom = (queue: Queue.Queue<TestThreadInput>) =>
      Stream.fromQueue(queue).pipe(
        Stream.mapEffect((input) =>
          input instanceof Error ? Effect.fail(input) : Effect.succeed(input),
        ),
      );
    const client = {
      [ORCHESTRATION_WS_METHODS.subscribeThread]: () =>
        Stream.unwrap(
          Ref.updateAndGet(subscriptionCount, (count) => count + 1).pipe(
            Effect.as(streamFrom(inputs)),
          ),
        ),
    } as unknown as WsRpcProtocolClient;
    const supervisorSession = yield* SubscriptionRef.make<Option.Option<RpcSession.RpcSession>>(
      Option.some(testSession(client)),
    );
    const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
      Option.some(PREPARED),
    );
    const snapshotLoader = ThreadSnapshotLoader.of({
      load: () =>
        Ref.update(loaderCalls, (count) => count + 1).pipe(
          Effect.as(Option.none<OrchestrationThreadDetailSnapshot>()),
        ),
    });
    const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
      target: TARGET,
      state: supervisorState,
      session: supervisorSession,
      prepared,
      connect: Effect.void,
      disconnect: Effect.void,
      retryNow: Effect.void,
    } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
    const cache = Persistence.EnvironmentCacheStore.of({
      loadShell: () => Effect.succeed(Option.none()),
      saveShell: () => Effect.void,
      loadThread: (_environmentId, threadId) =>
        Effect.succeed(
          threadId === THREAD_ID && options?.cached !== undefined
            ? Option.some({ snapshotSequence: 1, thread: options.cached })
            : Option.none(),
        ),
      saveThread: (_environmentId, snapshot) =>
        Ref.update(savedThreads, (current) => [...current, snapshot]),
      removeThread: (_environmentId, threadId) =>
        Ref.update(removedThreads, (current) => [...current, threadId]),
      loadServerConfig: () => Effect.succeed(Option.none()),
      saveServerConfig: () => Effect.void,
      loadVcsRefs: () => Effect.succeed(Option.none()),
      saveVcsRefs: () => Effect.void,
      clear: () => Effect.void,
    });
    const threadState = yield* makeEnvironmentThreadState(THREAD_ID).pipe(
      Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
      Effect.provideService(Persistence.EnvironmentCacheStore, cache),
      Effect.provideService(ThreadSnapshotLoader, snapshotLoader),
      Effect.provideService(
        ConnectionWakeups.ConnectionWakeups,
        ConnectionWakeups.ConnectionWakeups.of({ changes: Stream.fromQueue(wakeups) }),
      ),
    );
    yield* SubscriptionRef.changes(threadState).pipe(
      Stream.runForEach((state) =>
        Ref.set(latest, state).pipe(Effect.andThen(Queue.offer(observed, state))),
      ),
      Effect.forkScoped,
    );

    return {
      inputs,
      observed,
      latest,
      subscriptionCount,
      loaderCalls,
      removedThreads,
      savedThreads,
    };
  },
);

const snapshot = (thread: OrchestrationThread): OrchestrationThreadStreamItem => ({
  kind: "snapshot",
  snapshot: { snapshotSequence: 1, thread },
});

describe("EnvironmentThreads not-found terminal handling", () => {
  it.effect("transitions to deleted on a not-found tagged failure and stops resubscribing", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(
        harness.inputs,
        new OrchestrationGetSnapshotError({
          message: `Thread ${THREAD_ID} was not found`,
          reason: "not-found",
        }),
      );

      const state = yield* awaitThreadState(
        harness.observed,
        (value) => value.status === "deleted",
      );

      expect(Option.isNone(state.data)).toBe(true);
      expect(yield* Ref.get(harness.loaderCalls)).toBe(0);
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(1);
      expect(yield* Ref.get(harness.removedThreads)).toEqual([THREAD_ID]);

      // Advancing well past the 250ms retry delay must not trigger another
      // subscription attempt: the terminal failure ended the stream.
      yield* TestClock.adjust("10 seconds");
      yield* Effect.yieldNow;
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(1);
    }),
  );

  it.effect(
    "does not resurrect a removed thread from a persist debounced before the deletion arrived",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ cached: BASE_THREAD });
        // Publishing a live update queues a persist that is debounced 500ms —
        // long enough for a not-found failure to arrive and remove the cache
        // entry before the queued write fires.
        yield* Queue.offer(harness.inputs, snapshot({ ...BASE_THREAD, title: "Updated title" }));
        yield* awaitThreadState(
          harness.observed,
          (value) => Option.isSome(value.data) && value.data.value.title === "Updated title",
        );
        yield* Queue.offer(
          harness.inputs,
          new OrchestrationGetSnapshotError({
            message: `Thread ${THREAD_ID} was not found`,
            reason: "not-found",
          }),
        );

        yield* awaitThreadState(harness.observed, (value) => value.status === "deleted");
        expect(yield* Ref.get(harness.removedThreads)).toEqual([THREAD_ID]);

        // Let the debounced persist fire.
        yield* TestClock.adjust("1 second");
        yield* Effect.yieldNow;

        expect(yield* Ref.get(harness.savedThreads)).toEqual([]);
      }),
  );

  it.effect("keeps retrying an untagged (non-terminal) failure as today", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(harness.inputs, new Error("transient error"));

      yield* awaitThreadState(harness.observed, (value) => Option.isSome(value.error));
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(1);

      yield* TestClock.adjust("250 millis");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }

      expect(yield* Ref.get(harness.subscriptionCount)).toBe(2);
    }),
  );
});
