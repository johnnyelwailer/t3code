import {
  EnvironmentId,
  EventId,
  MessageId,
  ORCHESTRATION_V2_WS_METHODS,
  TurnItemId,
  type OrchestrationV2ThreadHistoryPage,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadDetailSnapshot,
  type OrchestrationV2ThreadStreamItem,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/reactivity";

import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type NetworkStatus,
  type PreparedConnection,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as Persistence from "../platform/persistence.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createEnvironmentThreadDetailAtoms } from "./threadDetail.ts";
import { THREAD_SNAPSHOT_IDLE_TTL_MS, THREAD_STATE_IDLE_TTL_MS } from "./threadRetention.ts";
import { v2Projection, v2ThreadId } from "./orchestrationV2TestFixtures.ts";
import * as ThreadHistoryController from "./threadHistoryController.ts";
import { createEnvironmentThreadStateAtoms, type EnvironmentThreadState } from "./threads.ts";
import * as ThreadSnapshotLoader from "./threadSnapshotHttp.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const THREAD_ID = v2ThreadId;
const THREAD: OrchestrationV2ThreadProjection = {
  ...v2Projection,
  thread: { ...v2Projection.thread, title: "Cached thread" },
};
const SNAPSHOT: OrchestrationV2ThreadDetailSnapshot = {
  snapshotSequence: 7,
  snapshotEventId: EventId.make("cached-event-7"),
  projection: THREAD,
};

const makeHarness = Effect.fn("TestThreadAtoms.makeHarness")(function* (options?: {
  readonly snapshot?: OrchestrationV2ThreadDetailSnapshot;
  readonly snapshotUnavailable?: boolean;
  /** Build the atoms with no options, so the shipped idle TTL applies. See `raw` below. */
  readonly productionTtl?: boolean;
}) {
  const subscriptions = yield* Queue.unbounded<{
    readonly afterSequence: number | undefined;
    readonly afterEventId: string | undefined;
    readonly events: Queue.Queue<OrchestrationV2ThreadStreamItem>;
    readonly closed: Deferred.Deferred<void>;
  }>();
  const olderLoads = yield* Queue.unbounded<{
    readonly cursor: string | null;
    readonly response: Deferred.Deferred<OrchestrationV2ThreadHistoryPage>;
    readonly closed: Deferred.Deferred<void>;
  }>();
  const snapshot = options?.snapshot ?? SNAPSHOT;
  let httpLoads = 0;
  let diskLoads = 0;
  let opened = 0;
  let active = 0;
  const client = {
    [ORCHESTRATION_V2_WS_METHODS.subscribeThread]: (input: {
      readonly afterSequence?: number;
      readonly afterEventId?: string;
    }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const events = yield* Queue.unbounded<OrchestrationV2ThreadStreamItem>();
          const closed = yield* Deferred.make<void>();
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              opened += 1;
              active += 1;
            }),
            () =>
              Effect.sync(() => {
                active -= 1;
              }).pipe(Effect.andThen(Deferred.succeed(closed, undefined))),
          );
          yield* Queue.offer(subscriptions, {
            afterSequence: input.afterSequence,
            afterEventId: input.afterEventId,
            events,
            closed,
          });
          return Stream.fromQueue(events);
        }),
      ),
  } as unknown as WsRpcProtocolClient;
  const session: RpcSession = {
    client,
    initialConfig: Effect.succeed({
      threadResumeCompletionMarker: true,
      threadSnapshotPagination: true,
    } as never),
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
    session: yield* SubscriptionRef.make(Option.some(session)),
    prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
      Option.some({
        environmentId: TARGET.environmentId,
        label: TARGET.label,
        httpBaseUrl: TARGET.httpBaseUrl,
        socketUrl: TARGET.wsBaseUrl,
        httpAuthorization: null,
        target: TARGET,
      }),
    ),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  });
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
      new Map(),
    ),
    networkStatus: yield* SubscriptionRef.make<NetworkStatus>("online"),
    start: Effect.void,
    register: () => Effect.die("Unexpected environment registration"),
    registerPlatform: () => Effect.die("Unexpected environment registration"),
    reconcilePlatform: () => Effect.die("Unexpected environment reconciliation"),
    remove: () => Effect.die("Unexpected environment removal"),
    removeRoute: () => Effect.die("Unexpected route removal"),
    reorderRoutes: () => Effect.die("Unexpected route reorder"),
    removeRelayEnvironments: () => Effect.die("Unexpected environment removal"),
    retryNow: () => Effect.void,
    setEnabled: () => Effect.die("Unexpected environment toggle"),
    setCompatibility: () => Effect.die("Unexpected compatibility update"),
    state: () => SubscriptionRef.get(supervisor.state),
    stateChanges: () => SubscriptionRef.changes(supervisor.state),
    run: (_environmentId, effect) =>
      Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    runStream: (_environmentId, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    followStream: (_environmentId, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
  });
  const historyController = yield* Effect.service(
    ThreadHistoryController.ThreadHistoryController,
  ).pipe(Effect.provide(ThreadHistoryController.layer));
  const historyHttpClient = HttpClient.make((request, url) =>
    Effect.gen(function* () {
      const response = yield* Deferred.make<OrchestrationV2ThreadHistoryPage>();
      const closed = yield* Deferred.make<void>();
      yield* Effect.addFinalizer(() => Deferred.succeed(closed, undefined));
      yield* Queue.offer(olderLoads, { cursor: url.searchParams.get("cursor"), response, closed });
      const page = yield* Deferred.await(response);
      return HttpClientResponse.fromWeb(request, Response.json(page));
    }).pipe(Effect.scoped),
  );
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(ThreadHistoryController.ThreadHistoryController, historyController),
      Layer.succeed(HttpClient.HttpClient, historyHttpClient),
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
      Layer.succeed(
        Persistence.EnvironmentCacheStore,
        Persistence.EnvironmentCacheStore.of({
          loadShell: () => Effect.succeedNone,
          saveShell: () => Effect.void,
          loadThread: () =>
            Effect.sync(() => {
              diskLoads += 1;
              return Option.none();
            }),
          saveThread: () => Effect.void,
          removeThread: () => Effect.void,
          loadServerConfig: () => Effect.succeedNone,
          saveServerConfig: () => Effect.void,
          loadVcsRefs: () => Effect.succeedNone,
          saveVcsRefs: () => Effect.void,
          removeVcsRefs: () => Effect.void,
          clearVcsRefs: () => Effect.void,
          clear: () => Effect.void,
        }),
      ),
      Layer.succeed(
        ThreadSnapshotLoader.ThreadSnapshotLoader,
        ThreadSnapshotLoader.ThreadSnapshotLoader.of({
          load: () =>
            Effect.sync(() => {
              httpLoads += 1;
              if (options?.snapshotUnavailable === true) {
                return { _tag: "unavailable" as const };
              }
              return {
                _tag: "present" as const,
                snapshot,
                ...(snapshot.historyCursor === undefined
                  ? {}
                  : {
                      history: {
                        historyCursor: snapshot.historyCursor,
                        hasMoreHistory: snapshot.hasMoreHistory ?? false,
                        latestLocalTurnOrdinal: snapshot.latestLocalTurnOrdinal ?? null,
                      },
                    }),
              };
            }),
        }),
      ),
    ),
  );
  // Two modes, on purpose.
  //
  // `productionTtl: true` constructs the atoms exactly as the apps do — no
  // options, so the shipped `THREAD_STATE_IDLE_TTL_MS` applies. The idle-TTL
  // cases below use this, so lowering the shipped default breaks them. Passing
  // the TTL in explicitly would pin the argument instead of the default and
  // guard nothing.
  //
  // Everything else opts OUT with `idleTtlMs: 0`. Those cases assert what
  // survives *across* a teardown and use "the stream closed" as a
  // synchronisation handle; under the real TTL every `Deferred.await(x.closed)`
  // becomes a timer to drive, which tests the clock rather than the behaviour.
  const raw = options?.productionTtl
    ? createEnvironmentThreadStateAtoms(runtime)
    : createEnvironmentThreadStateAtoms(runtime, { idleTtlMs: 0 });
  const details = createEnvironmentThreadDetailAtoms(raw.stateAtom);
  const ref = { environmentId: TARGET.environmentId, threadId: THREAD_ID };
  const stateAtom = details.stateAtom(ref);
  const makeRegistry = Effect.acquireRelease(
    Effect.sync(() => AtomRegistry.make({ defaultIdleTTL: 60_000, timeoutResolution: 1 })),
    (registry) => Effect.sync(() => registry.dispose()),
  );
  const registry = yield* makeRegistry;

  return {
    registry,
    makeRegistry,
    rawAtoms: raw,
    stateAtom,
    details,
    ref,
    subscriptions,
    olderLoads,
    loadEarlier: () => historyController.loadEarlier(TARGET.environmentId, THREAD_ID),
    counts: () => ({ httpLoads, diskLoads, opened, active }),
  };
});

function observeState(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<EnvironmentThreadState>,
  predicate: (state: EnvironmentThreadState) => boolean,
) {
  return AtomRegistry.toStream(registry, atom).pipe(
    Stream.filter(predicate),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  );
}

function currentThread(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<EnvironmentThreadState>,
) {
  return Option.getOrThrow(registry.get(atom).data);
}

describe("createEnvironmentThreadStateAtoms", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.effect("keeps warm data and resumes a completed cursor without loading another snapshot", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      yield* Queue.offer(first.events, {
        kind: "event",
        sequence: 8,
        event: {
          id: EventId.make("metadata-1"),
          type: "thread.metadata-updated",
          threadId: THREAD_ID,
          occurredAt: THREAD.thread.updatedAt,
          payload: { ...THREAD.thread, title: "Retained title" },
        },
      });
      yield* Queue.offer(first.events, { kind: "synchronized" });
      yield* observeState(h.registry, h.stateAtom, (state) => state.status === "live");
      const before = currentThread(h.registry, h.stateAtom);
      unmount();
      yield* Deferred.await(first.closed);
      const remount = h.registry.mount(h.stateAtom);
      expect(currentThread(h.registry, h.stateAtom)).toBe(before);
      const next = yield* Queue.take(h.subscriptions);
      expect(next.afterSequence).toBe(8);
      expect(h.counts()).toEqual({ httpLoads: 1, diskLoads: 1, opened: 2, active: 1 });
      remount();
      yield* Deferred.await(next.closed);
    }),
  );

  // Live-state idle TTL. These pin WHEN teardown happens, at the shipped value;
  // everything else pins what survives ACROSS a teardown, at TTL 0.
  //
  // The first case is the regression guard. Restoring `Atom.setIdleTTL(0)` (the
  // upstream #9740 behaviour) makes it fail, because a remount inside the window
  // would open a second subscription. On a live install that cost 1.35
  // `subscribeThread` re-opens per persisted domain event — 17 of 19
  // subscriptions aborted inside one second, median lifetime 2.9ms. Do not
  // "simplify" this back to an immediate close.

  it.effect("keeps the live stream open across a consumer gap inside the idle TTL", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({ productionTtl: true });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      expect(h.counts().opened).toBe(1);

      // A render pass that drops the consumer count to zero and restores it
      // well inside the window: the node is revived, not rebuilt.
      unmount();
      yield* Effect.yieldNow;
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS - 1));
      const remount = h.registry.mount(h.stateAtom);
      yield* Effect.yieldNow;

      expect(yield* Deferred.isDone(first.closed)).toBe(false);
      expect(h.counts()).toEqual({ httpLoads: 1, diskLoads: 1, opened: 1, active: 1 });

      remount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1));
      yield* Deferred.await(first.closed);
    }),
  );

  it.effect("closes the live stream once the idle TTL elapses", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({ productionTtl: true });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);

      unmount();
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(first.closed)).toBe(false);

      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1));
      yield* Deferred.await(first.closed);
      expect(h.counts().active).toBe(0);
    }),
  );

  it.effect("defers older-page cancellation until the idle TTL elapses", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({
        productionTtl: true,
        snapshot: {
          ...SNAPSHOT,
          historyCursor: "older-1",
          hasMoreHistory: true,
        },
      });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      const loading = yield* h.loadEarlier().pipe(Effect.forkScoped);
      const older = yield* Queue.take(h.olderLoads);

      // The retained node owns the older-page worker and its request
      // registration, so unmount no longer cancels them — it only starts the
      // clock. A consumer returning inside the window keeps the in-flight fetch.
      unmount();
      yield* Effect.yieldNow;
      expect(yield* Deferred.isDone(older.closed)).toBe(false);
      expect(h.registry.get(h.stateAtom).history.loading).toBe(true);

      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(older.closed);
      yield* Deferred.await(first.closed);
      yield* Fiber.await(loading);
    }),
  );

  it.effect("reuses the retained subscription when a consumer returns inside the window", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({ productionTtl: true });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      yield* Queue.offer(first.events, { kind: "synchronized" });
      yield* observeState(h.registry, h.stateAtom, (state) => state.status === "live");

      unmount();
      yield* Effect.yieldNow;
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(1_000));
      const remount = h.registry.mount(h.stateAtom);
      yield* Effect.yieldNow;

      // Retained, so no second subscription and no reload: opened stays 1.
      expect(yield* Deferred.isDone(first.closed)).toBe(false);
      expect(h.counts()).toEqual({ httpLoads: 1, diskLoads: 1, opened: 1, active: 1 });

      remount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(first.closed);
    }),
  );

  it.effect("keeps the snapshot warm after the live node expires", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({ productionTtl: true });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);

      // The live node and the resume snapshot expire on different clocks. Past
      // the live TTL the stream is gone, but the snapshot still serves a warm
      // remount, so returning re-subscribes without a second HTTP/disk load.
      unmount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(first.closed);

      const remount = h.registry.mount(h.stateAtom);
      const next = yield* Queue.take(h.subscriptions);
      expect(h.counts()).toEqual({ httpLoads: 1, diskLoads: 1, opened: 2, active: 1 });

      remount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(next.closed);
    }),
  );

  it.effect("reloads once both the live node and the snapshot have expired", () =>
    Effect.gen(function* () {
      vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      const h = yield* makeHarness({ productionTtl: true });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);

      // Past BOTH clocks there is nothing warm left, so the return pays for a
      // fresh snapshot. This is the boundary the shorter live TTL must not move:
      // the snapshot's own five minutes still governs when data is discarded.
      unmount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(first.closed);
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_SNAPSHOT_IDLE_TTL_MS + 1));

      const remount = h.registry.mount(h.stateAtom);
      const next = yield* Queue.take(h.subscriptions);
      expect(h.counts()).toEqual({ httpLoads: 2, diskLoads: 2, opened: 2, active: 1 });

      remount();
      yield* Effect.promise(() => vi.advanceTimersByTimeAsync(THREAD_STATE_IDLE_TTL_MS + 1001));
      yield* Deferred.await(next.closed);
    }),
  );

  it.effect("cancels older-page work on unmount and permits it again on a warm return", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness({
        snapshot: {
          ...SNAPSHOT,
          historyCursor: "older-1",
          hasMoreHistory: true,
        },
      });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      const loading = yield* h.loadEarlier().pipe(Effect.forkScoped);
      const older = yield* Queue.take(h.olderLoads);
      expect(h.registry.get(h.stateAtom).history.loading).toBe(true);
      unmount();
      yield* Deferred.await(first.closed);
      yield* Deferred.await(older.closed);
      yield* Fiber.await(loading);
      const remount = h.registry.mount(h.stateAtom);
      const next = yield* Queue.take(h.subscriptions);
      expect(h.registry.get(h.stateAtom).history.loading).toBe(false);
      const retrying = yield* h.loadEarlier().pipe(Effect.forkScoped);
      const retried = yield* Queue.take(h.olderLoads);
      expect(retried.cursor).toBe("older-1");
      expect(h.counts().httpLoads).toBe(1);
      remount();
      yield* Deferred.await(next.closed);
      yield* Deferred.await(retried.closed);
      yield* Fiber.await(retrying);
    }),
  );

  it.effect(
    "merges older history after an HTTP failure falls back to a bounded socket snapshot",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness({ snapshotUnavailable: true });
        const unmount = h.registry.mount(h.stateAtom);
        const subscription = yield* Queue.take(h.subscriptions);
        expect(subscription.afterSequence).toBeUndefined();

        yield* Queue.offer(subscription.events, {
          kind: "snapshot",
          snapshotSequence: 12,
          projection: THREAD,
          historyCursor: "socket-older-1",
          hasMoreHistory: true,
          latestLocalTurnOrdinal: 4,
          payloadBudgetExceeded: false,
        });
        yield* Queue.offer(subscription.events, { kind: "synchronized" });
        yield* observeState(
          h.registry,
          h.stateAtom,
          (state) => state.status === "live" && state.history.historyCursor === "socket-older-1",
        );

        const loading = yield* h.loadEarlier().pipe(Effect.forkScoped);
        const request = yield* Queue.take(h.olderLoads);
        expect(request.cursor).toBe("socket-older-1");
        const olderItem = {
          id: TurnItemId.make("socket-fallback-older-item"),
          type: "command_execution" as const,
          threadId: THREAD_ID,
          runId: null,
          nodeId: null,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 1,
          status: "completed" as const,
          title: "Earlier command",
          input: "pwd",
          output: "/workspace",
          exitCode: 0,
          startedAt: THREAD.thread.createdAt,
          completedAt: THREAD.thread.createdAt,
          updatedAt: THREAD.thread.createdAt,
        };
        yield* Deferred.succeed(request.response, {
          snapshotSequence: 12,
          items: [
            {
              position: 0,
              visibility: "local",
              sourceThreadId: THREAD_ID,
              sourceItemId: olderItem.id,
              item: olderItem,
            },
          ],
          nextCursor: null,
          hasMoreHistory: false,
        });
        expect(yield* Fiber.join(loading)).toEqual({ _tag: "loaded" });

        const state = h.registry.get(h.stateAtom);
        expect(
          Option.getOrThrow(state.data).visibleTurnItems.map((row) => row.sourceItemId),
        ).toEqual([olderItem.id]);
        expect(state.history).toMatchObject({
          historyCursor: null,
          hasMoreHistory: false,
          loading: false,
          error: null,
          expanded: true,
          latestLocalTurnOrdinal: 4,
        });
        expect(h.counts().httpLoads).toBe(1);

        unmount();
        yield* Deferred.await(subscription.closed);
      }),
  );
});

it.effect("keeps snapshot boundaries and completion markers ordered inside a replay batch", () =>
  Effect.gen(function* () {
    const h = yield* makeHarness();
    const unmount = h.registry.mount(h.stateAtom);
    const first = yield* Queue.take(h.subscriptions);
    const title = (sequence: number, value: string): OrchestrationV2ThreadStreamItem => ({
      kind: "event",
      sequence,
      event: {
        id: EventId.make(`batch-title-${sequence}`),
        type: "thread.metadata-updated",
        threadId: THREAD_ID,
        occurredAt: THREAD.thread.updatedAt,
        payload: { ...THREAD.thread, title: value },
      },
    });
    yield* Queue.offerAll(first.events, [
      title(8, "Before snapshot"),
      {
        kind: "snapshot",
        snapshotSequence: 20,
        projection: THREAD,
        historyCursor: "older-batch",
        hasMoreHistory: true,
        latestLocalTurnOrdinal: 10,
      },
      title(21, "After snapshot"),
      title(19, "Stale replay"),
      { kind: "synchronized" },
    ]);
    const state = yield* observeState(h.registry, h.stateAtom, (value) => value.status === "live");
    expect(Option.getOrThrow(state.data).thread.title).toBe("After snapshot");
    expect(state.history.historyCursor).toBe("older-batch");
    expect(state.history.latestLocalTurnOrdinal).toBe(10);
    unmount();
    yield* Deferred.await(first.closed);
    const remount = h.registry.mount(h.stateAtom);
    const next = yield* Queue.take(h.subscriptions);
    expect(next.afterSequence).toBe(21);
    remount();
    yield* Deferred.await(next.closed);
  }),
);

describe("thread resume cursor identity", () => {
  const messagePayload = (sequence: number, text: string) => ({
    id: MessageId.make(`identity-message-${sequence}`),
    threadId: THREAD_ID,
    runId: null,
    nodeId: null,
    role: "assistant" as const,
    text,
    streaming: false,
    attachments: [],
    createdBy: "agent" as const,
    creationSource: "provider" as const,
    createdAt: THREAD.thread.createdAt,
    updatedAt: THREAD.thread.createdAt,
  });
  const messageEvent = (sequence: number, text: string): OrchestrationV2ThreadStreamItem => ({
    kind: "event",
    sequence,
    event: {
      id: EventId.make(`identity-event-${sequence}`),
      type: "message.updated",
      threadId: THREAD_ID,
      occurredAt: THREAD.thread.createdAt,
      payload: messagePayload(sequence, text),
    },
  });

  it.effect("resumes with the event id of the cached snapshot and of each applied event", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness({
        snapshot: { ...SNAPSHOT, snapshotEventId: EventId.make("cached-event-7") },
      });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      expect(first.afterSequence).toBe(7);
      expect(first.afterEventId).toBe("cached-event-7");
      yield* Queue.offer(first.events, messageEvent(8, "applied"));
      yield* Queue.offer(first.events, { kind: "synchronized" });
      yield* observeState(h.registry, h.stateAtom, (state) => state.status === "live");
      unmount();
      yield* Deferred.await(first.closed);
      const remount = h.registry.mount(h.stateAtom);
      const next = yield* Queue.take(h.subscriptions);
      expect(next.afterSequence).toBe(8);
      expect(next.afterEventId).toBe("identity-event-8");
      remount();
      yield* Deferred.await(next.closed);
    }),
  );

  it.effect("does not resume a cached cursor that has no event id", () =>
    Effect.gen(function* () {
      // A cache written before ids existed, or a snapshot from an older server.
      const h = yield* makeHarness({ snapshot: { snapshotSequence: 7, projection: THREAD } });
      const unmount = h.registry.mount(h.stateAtom);
      const first = yield* Queue.take(h.subscriptions);
      // The cached projection still paints; the server is asked for a snapshot.
      expect(currentThread(h.registry, h.stateAtom)).toBe(THREAD);
      expect(first.afterSequence).toBeUndefined();
      expect(first.afterEventId).toBeUndefined();
      unmount();
      yield* Deferred.await(first.closed);
    }),
  );

  it.effect(
    "keeps the cursor id on the unknown event it advanced to, and clears it when absent",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness({
          snapshot: { ...SNAPSHOT, snapshotEventId: EventId.make("cached-event-7") },
        });
        const unmount = h.registry.mount(h.stateAtom);
        const first = yield* Queue.take(h.subscriptions);
        yield* Queue.offer(first.events, {
          kind: "unknown-event",
          sequence: 8,
          eventType: "run.from-a-future-server",
          eventId: EventId.make("future-event-8"),
        });
        yield* Queue.offer(first.events, { kind: "synchronized" });
        yield* observeState(h.registry, h.stateAtom, (state) => state.status === "live");
        unmount();
        yield* Deferred.await(first.closed);
        const remount = h.registry.mount(h.stateAtom);
        const second = yield* Queue.take(h.subscriptions);
        // Never the stale id of sequence 7 next to sequence 8.
        expect(second.afterSequence).toBe(8);
        expect(second.afterEventId).toBe("future-event-8");
        // A wire event without an id leaves the cursor unnamed instead of stale.
        yield* Queue.offer(second.events, {
          kind: "unknown-event",
          sequence: 9,
          eventType: "run.from-a-future-server",
        });
        yield* Queue.offer(second.events, { kind: "synchronized" });
        yield* observeState(h.registry, h.stateAtom, (state) => state.status === "live");
        remount();
        yield* Deferred.await(second.closed);
        const again = h.registry.mount(h.stateAtom);
        const third = yield* Queue.take(h.subscriptions);
        // Unnamed cursor: not resumable, so no sequence either.
        expect(third.afterSequence).toBeUndefined();
        expect(third.afterEventId).toBeUndefined();
        again();
        yield* Deferred.await(third.closed);
      }),
  );

  it.effect(
    "replaces cached phantom turns on a snapshot and keeps applying events below the old cursor",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness({
          snapshot: {
            snapshotSequence: 50,
            snapshotEventId: EventId.make("old-timeline-50"),
            projection: { ...THREAD, messages: [messagePayload(40, "phantom turn")] },
          },
        });
        const unmount = h.registry.mount(h.stateAtom);
        const first = yield* Queue.take(h.subscriptions);
        expect(first.afterSequence).toBe(50);
        expect(first.afterEventId).toBe("old-timeline-50");
        expect(currentThread(h.registry, h.stateAtom).messages).toHaveLength(1);

        // The server found sequence 50 holds a different event: it replaces the
        // cache with a snapshot whose cursor is far below the stale one.
        yield* Queue.offer(first.events, {
          kind: "snapshot",
          snapshotSequence: 12,
          snapshotEventId: EventId.make("new-timeline-12"),
          projection: { ...THREAD, thread: { ...THREAD.thread, title: "New timeline" } },
        });
        yield* Queue.offer(first.events, { kind: "synchronized" });
        const replaced = yield* observeState(
          h.registry,
          h.stateAtom,
          (state) => state.status === "live",
        );
        const thread = Option.getOrThrow(replaced.data);
        expect(thread.thread.title).toBe("New timeline");
        expect(thread.messages).toEqual([]);

        // Sequence 13 is under the old cursor (50) but after the new one.
        yield* Queue.offer(first.events, messageEvent(13, "after the reset"));
        yield* observeState(
          h.registry,
          h.stateAtom,
          (state) => Option.getOrNull(state.data)?.messages[0]?.text === "after the reset",
        );
        unmount();
        yield* Deferred.await(first.closed);
        const remount = h.registry.mount(h.stateAtom);
        const next = yield* Queue.take(h.subscriptions);
        expect(next.afterSequence).toBe(13);
        expect(next.afterEventId).toBe("identity-event-13");
        remount();
        yield* Deferred.await(next.closed);
      }),
  );
});
