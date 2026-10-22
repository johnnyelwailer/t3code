import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ThreadStreamItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as OrchestrationEventStore from "../persistence/OrchestrationEventStore.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { subscribeOrchestrationV2Thread } from "../ws.ts";
import * as EventSink from "./EventSink.ts";
import * as EventStore from "./EventStore.ts";
import * as ProjectionMaintenance from "./ProjectionMaintenance.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";

const THREAD_ID = ThreadId.make("resume-identity-thread");
const NOW = DateTime.makeUnsafe("2026-06-01T00:00:00Z");
const PROVIDER = ProviderInstanceId.make("codex");

const baseThread = {
  id: THREAD_ID,
  projectId: ProjectId.make("resume-identity-project"),
  title: "Resume identity",
  providerInstanceId: PROVIDER,
  modelSelection: { instanceId: PROVIDER, model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: THREAD_ID },
  forkedFrom: null,
  createdBy: "user" as const,
  creationSource: "web" as const,
  createdAt: NOW,
  updatedAt: NOW,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  lastVisitedAt: null,
  deletedAt: null,
};

const events: ReadonlyArray<OrchestrationV2DomainEvent> = [
  {
    id: EventId.make("e-created"),
    type: "thread.created",
    threadId: THREAD_ID,
    occurredAt: NOW,
    payload: baseThread,
  },
  ...[1, 2, 3].map((n): OrchestrationV2DomainEvent => ({
    id: EventId.make(`e-title-${n}`),
    type: "thread.metadata-updated",
    threadId: THREAD_ID,
    occurredAt: NOW,
    payload: { ...baseThread, title: `Title ${n}` },
  })),
];

// Takes a sequence in the middle of the thread's range that is not the thread's own.
const FOREIGN_THREAD_ID = ThreadId.make("resume-identity-other-thread");
const foreignEvent: OrchestrationV2DomainEvent = {
  id: EventId.make("e-foreign"),
  type: "thread.created",
  threadId: FOREIGN_THREAD_ID,
  occurredAt: NOW,
  payload: {
    ...baseThread,
    id: FOREIGN_THREAD_ID,
    lineage: { ...baseThread.lineage, rootThreadId: FOREIGN_THREAD_ID },
  },
};

const layerPersistence = EventSink.layer.pipe(
  Layer.provideMerge(EventStore.layerFromOrchestrationEventStore),
  Layer.provideMerge(ProjectionStore.layer),
  Layer.provideMerge(OrchestrationEventStore.layer),
  Layer.provideMerge(SqlitePersistence.layerMemory),
);
// Reads and the live stream delegate to the real SQL projection and sink, as the runtime does.
const layerServices = Layer.unwrap(
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const sink = yield* EventSink.EventSinkV2;
    return Layer.mock(ThreadManagementService.ThreadManagementService)({
      ensureLegacyTranscript: () => Effect.void,
      getThreadSnapshot: (id) => projections.getThreadSnapshot(id).pipe(Effect.orDie),
      getThreadSnapshotWindow: (id, options) =>
        projections.getThreadSnapshotWindow(id, options).pipe(Effect.orDie),
      getThreadShell: (id) => projections.getThreadShell(id).pipe(Effect.orDie),
      streamStoredEventsFrom: (input) =>
        sink.stream({ ...input, bounded: true }).pipe(Stream.orDie),
    });
  }),
).pipe(Layer.provideMerge(layerPersistence));

/** Seed the thread, then collect what a client resuming with `resume` is sent before it is live. */
const resumeWith = (
  resume: (
    stored: ReadonlyArray<{ readonly sequence: number }>,
    foreign: { readonly sequence: number },
  ) => {
    readonly afterSequence: number;
    readonly afterEventId?: EventId;
  },
) =>
  Effect.gen(function* () {
    const sink = yield* EventSink.EventSinkV2;
    const head = yield* sink.write({ events: events.slice(0, 2) });
    const [foreign] = yield* sink.write({ events: [foreignEvent] });
    const tail = yield* sink.write({ events: events.slice(2) });
    const stored = [...head, ...tail];
    const items = yield* Stream.unwrap(
      subscribeOrchestrationV2Thread({
        threadId: THREAD_ID,
        requestCompletionMarker: true,
        ...resume(stored, foreign!),
      }),
    ).pipe(
      Stream.takeUntil((item: OrchestrationV2ThreadStreamItem) => item.kind === "synchronized"),
      Stream.runCollect,
    );
    return { stored, items: Array.from(items) };
  }).pipe(Effect.provide(layerServices));

const layerServicesWithMaintenance = ProjectionMaintenance.layer.pipe(
  Layer.provideMerge(layerServices),
);

const kinds = (items: ReadonlyArray<OrchestrationV2ThreadStreamItem>) =>
  items.map((item) => item.kind);

describe("thread resume cursor identity", () => {
  it.effect("replays the delta when the cursor's event id matches the stored event", () =>
    Effect.gen(function* () {
      const { stored, items } = yield* resumeWith((rows) => ({
        afterSequence: rows[1]!.sequence,
        afterEventId: EventId.make("e-title-1"),
      }));
      assert.deepStrictEqual(kinds(items), ["event", "event", "synchronized"]);
      assert.deepStrictEqual(
        items.flatMap((item) => (item.kind === "event" ? [item.sequence] : [])),
        [stored[2]!.sequence, stored[3]!.sequence],
      );
    }),
  );

  it.effect("sends a snapshot when the stored event at the cursor has another id", () =>
    Effect.gen(function* () {
      const { stored, items } = yield* resumeWith((rows) => ({
        afterSequence: rows[1]!.sequence,
        afterEventId: EventId.make("from-another-timeline"),
      }));
      assert.deepStrictEqual(kinds(items), ["snapshot", "synchronized"]);
      const snapshot = items[0];
      assert.isTrue(snapshot?.kind === "snapshot");
      if (snapshot?.kind !== "snapshot") return;
      assert.equal(snapshot.snapshotSequence, stored[3]!.sequence);
      // The replacement cursor carries its own identity so the next resume can be verified.
      assert.equal(snapshot.snapshotEventId, EventId.make("e-title-3"));
    }),
  );

  it.effect("sends a snapshot when no event exists at the cursor's sequence", () =>
    Effect.gen(function* () {
      const { items } = yield* resumeWith((_stored, foreign) => ({
        afterSequence: foreign.sequence,
        afterEventId: EventId.make("e-title-1"),
      }));
      assert.deepStrictEqual(kinds(items), ["snapshot", "synchronized"]);
    }),
  );

  it.effect("keeps sequence-only resume for clients that send no event id", () =>
    Effect.gen(function* () {
      const { stored, items } = yield* resumeWith((rows) => ({
        afterSequence: rows[1]!.sequence,
      }));
      assert.deepStrictEqual(kinds(items), ["event", "event", "synchronized"]);
      const first = items[0];
      assert.equal(first?.kind === "event" && first.sequence, stored[2]!.sequence);
    }),
  );

  it.effect("replays the delta when background compaction deleted the cursor's event", () =>
    Effect.gen(function* () {
      const sink = yield* EventSink.EventSinkV2;
      const stored = yield* sink.write({ events });
      const maintenance = yield* ProjectionMaintenance.ProjectionMaintenanceV2;
      const summary = yield* maintenance.compactEventStore;
      // Title 1 and 2 are superseded by title 3, so the client's cursor event is gone.
      assert.equal(summary.deletedEventCount, 2);
      const items = yield* Stream.unwrap(
        subscribeOrchestrationV2Thread({
          threadId: THREAD_ID,
          requestCompletionMarker: true,
          afterSequence: stored[1]!.sequence,
          afterEventId: EventId.make("e-title-1"),
        }),
      ).pipe(
        Stream.takeUntil((item: OrchestrationV2ThreadStreamItem) => item.kind === "synchronized"),
        Stream.runCollect,
      );
      assert.deepStrictEqual(kinds(Array.from(items)), ["event", "synchronized"]);
      const [first] = Array.from(items);
      assert.equal(first?.kind === "event" && first.sequence, stored[3]!.sequence);
    }).pipe(Effect.provide(layerServicesWithMaintenance)),
  );
});
