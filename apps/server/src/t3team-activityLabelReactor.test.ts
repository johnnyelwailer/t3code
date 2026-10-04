import { ThreadId, type OrchestrationEvent, type ProviderRuntimeEvent } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import { T3TeamActivityLabelReactorLive } from "./t3team-activityLabelReactor.ts";
import * as ServerSettings from "./serverSettings.ts";

/**
 * GHE #297 Codex finding (LOW): a deleted thread's activity-state re-arming
 * stall timer (`t3team-activityState.ts`) used to keep ticking forever —
 * `onIdle` in `t3team-activityLabelReactor.ts` only cleared the tracker on
 * `thread.turn-diff-completed` / `thread.settled` / `thread.turn-interrupt-requested`,
 * never on `thread.deleted`. This exercises the real reactor layer (rather
 * than the pure `t3team-activityState.ts` tracker, whose own `clear()` is
 * already unit-tested) so it actually proves the missing wiring is fixed.
 *
 * Both domain events and provider runtime events are driven through PubSubs
 * so the test controls ordering precisely: set a non-null state first (via a
 * runtime event), THEN delete the thread, and assert the tracker's null
 * clear was dispatched — same shape `thread.settled` already produces.
 */

const drainFibers = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, {
  discard: true,
});

const turnStartedRuntimeEvent = (threadId: ThreadId): ProviderRuntimeEvent =>
  ({
    type: "turn.started",
    eventId: "evt-turn-started",
    provider: "codex",
    providerInstanceId: "codex",
    threadId,
    createdAt: "2026-01-01T00:00:00.000Z",
    turnId: "turn-1",
    payload: {},
  }) as unknown as ProviderRuntimeEvent;

describe("T3TeamActivityLabelReactorLive — thread.deleted cleanup (GHE #297)", () => {
  it.effect(
    "clears the tracked activity state on thread.deleted (same shape as thread.settled)",
    () =>
      Effect.gen(function* () {
        const threadId = ThreadId.make("thread-activity-label-deleted-test");
        const dispatchedActivityStates: Array<unknown> = [];

        const domainEventPubSub = yield* PubSub.unbounded<OrchestrationEvent>();
        const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

        const fakeEngine: OrchestrationEngineShape = {
          streamDomainEvents: Stream.fromPubSub(domainEventPubSub),
          dispatch: (command: unknown) =>
            Effect.sync(() => {
              const meta = command as { activityState?: unknown };
              if ("activityState" in meta) dispatchedActivityStates.push(meta.activityState);
              return { sequence: 0 };
            }),
        } as unknown as OrchestrationEngineShape;

        const layer = T3TeamActivityLabelReactorLive.pipe(
          Layer.provideMerge(Layer.succeed(OrchestrationEngineService, fakeEngine)),
          Layer.provideMerge(
            Layer.succeed(ProjectionSnapshotQuery, {
              getThreadShellById: () => Effect.succeedNone,
            } as unknown as ProjectionSnapshotQuery["Service"]),
          ),
          Layer.provideMerge(
            Layer.succeed(TextGeneration, {} as unknown as TextGeneration["Service"]),
          ),
          Layer.provideMerge(
            Layer.succeed(ProviderService, {
              streamEvents: Stream.fromPubSub(runtimeEventPubSub),
            } as unknown as ProviderService["Service"]),
          ),
          Layer.provideMerge(ServerSettings.ServerSettingsService.layerTest()),
        );

        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* Layer.build(layer);
            yield* drainFibers;

            // 1. Drive the deterministic tracker into a non-null state
            //    ("thinking") — otherwise clearing on delete would be a
            //    no-op and this test would pass regardless of the fix.
            yield* PubSub.publish(runtimeEventPubSub, turnStartedRuntimeEvent(threadId));
            yield* drainFibers;
            expect(dispatchedActivityStates).toEqual(["thinking"]);

            // 2. Delete the thread. Before the fix, `onIdle` never matched
            //    `thread.deleted`, so no clear was ever dispatched and the
            //    state — and its re-arming stall timer — kept running.
            yield* PubSub.publish(domainEventPubSub, {
              type: "thread.deleted",
              payload: { threadId },
            } as unknown as OrchestrationEvent);
            yield* drainFibers;

            expect(dispatchedActivityStates).toEqual(["thinking", null]);
          }),
        );
      }),
  );

  it.effect("ignores an unrelated domain event — no activity-state dispatch", () =>
    Effect.gen(function* () {
      const threadId = ThreadId.make("thread-activity-label-unrelated-test");
      const dispatchedActivityStates: Array<unknown> = [];
      const domainEventPubSub = yield* PubSub.unbounded<OrchestrationEvent>();
      const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

      const fakeEngine: OrchestrationEngineShape = {
        streamDomainEvents: Stream.fromPubSub(domainEventPubSub),
        dispatch: (command: unknown) =>
          Effect.sync(() => {
            const meta = command as { activityState?: unknown };
            if ("activityState" in meta) dispatchedActivityStates.push(meta.activityState);
            return { sequence: 0 };
          }),
      } as unknown as OrchestrationEngineShape;

      const layer = T3TeamActivityLabelReactorLive.pipe(
        Layer.provideMerge(Layer.succeed(OrchestrationEngineService, fakeEngine)),
        Layer.provideMerge(
          Layer.succeed(ProjectionSnapshotQuery, {
            getThreadShellById: () => Effect.succeedNone,
          } as unknown as ProjectionSnapshotQuery["Service"]),
        ),
        Layer.provideMerge(
          Layer.succeed(TextGeneration, {} as unknown as TextGeneration["Service"]),
        ),
        Layer.provideMerge(
          Layer.succeed(ProviderService, {
            streamEvents: Stream.fromPubSub(runtimeEventPubSub),
          } as unknown as ProviderService["Service"]),
        ),
        Layer.provideMerge(ServerSettings.ServerSettingsService.layerTest()),
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Layer.build(layer);
          yield* drainFibers;
          yield* PubSub.publish(domainEventPubSub, {
            type: "thread.created",
            payload: { threadId },
          } as unknown as OrchestrationEvent);
          yield* drainFibers;
          expect(dispatchedActivityStates).toEqual([]);
        }),
      );
    }),
  );
});
