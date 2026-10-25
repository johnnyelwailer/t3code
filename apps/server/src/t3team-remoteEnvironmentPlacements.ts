/**
 * The children delegate_task placed on a cloud session from THIS server, for the server's
 * lifetime: thread id → the session and the repository key delegate_task derived from the child's
 * project. A `remoteEnvironment` turn runs only for a thread found here, or one re-established
 * after a restart (`t3team-remoteEnvironmentAuthorize.ts`).
 *
 * A child's first run can start a moment before delegate_task registers it, so a lookup waits
 * briefly for a registration that is about to land. One entry per placed child; entries are not
 * removed while the server runs (a child can take more turns later). Registering also writes the
 * durable, write-once marker (`t3team-cloudChildPlacementMarkers.ts`) a restart is re-established
 * from; `marker` reads it.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import {
  type CloudChildPlacementMarkers,
  makeMemoryCloudChildPlacementMarkers,
  makeSqlCloudChildPlacementMarkers,
} from "./t3team-cloudChildPlacementMarkers.ts";

export interface RemoteEnvironmentPlacement {
  readonly sessionId: string;
  readonly repositoryKey: string;
}

export interface RemoteEnvironmentPlacementsShape {
  readonly register: (
    threadId: ThreadId,
    placement: RemoteEnvironmentPlacement,
  ) => Effect.Effect<void>;
  readonly lookup: (
    threadId: ThreadId,
    wait: Duration.Input,
  ) => Effect.Effect<RemoteEnvironmentPlacement | undefined>;
  /** The placement delegate_task recorded durably for the thread, if any. */
  readonly marker: (threadId: ThreadId) => Effect.Effect<RemoteEnvironmentPlacement | undefined>;
}

export class RemoteEnvironmentPlacements extends Context.Service<
  RemoteEnvironmentPlacements,
  RemoteEnvironmentPlacementsShape
>()("t3/t3team-remoteEnvironmentPlacements/RemoteEnvironmentPlacements") {}

export const makeRemoteEnvironmentPlacements = Effect.fn("RemoteEnvironmentPlacements.make")(
  function* (markers: CloudChildPlacementMarkers) {
    const entries = yield* Ref.make(
      new Map<ThreadId, Deferred.Deferred<RemoteEnvironmentPlacement>>(),
    );
    const slot = Effect.fn("RemoteEnvironmentPlacements.slot")(function* (threadId: ThreadId) {
      const fresh = yield* Deferred.make<RemoteEnvironmentPlacement>();
      return yield* Ref.modify(
        entries,
        (
          current,
        ): [
          Deferred.Deferred<RemoteEnvironmentPlacement>,
          Map<ThreadId, Deferred.Deferred<RemoteEnvironmentPlacement>>,
        ] => {
          const existing = current.get(threadId);
          return existing === undefined
            ? [fresh, new Map(current).set(threadId, fresh)]
            : [existing, current];
        },
      );
    });
    const lookup = Effect.fn("RemoteEnvironmentPlacements.lookup")(function* (
      threadId: ThreadId,
      wait: Duration.Input,
    ) {
      const entry = yield* slot(threadId);
      const found = yield* Deferred.await(entry).pipe(Effect.timeoutOption(wait));
      if (Option.isSome(found)) return found.value;
      yield* Ref.update(entries, (current) => {
        if (current.get(threadId) !== entry) return current;
        const next = new Map(current);
        next.delete(threadId);
        return next;
      });
      return undefined;
    });
    return {
      register: (threadId, placement) =>
        markers.record(threadId, placement).pipe(
          Effect.andThen(slot(threadId)),
          Effect.flatMap((entry) => Deferred.succeed(entry, placement)),
          Effect.asVoid,
        ),
      marker: markers.read,
      lookup,
    } satisfies RemoteEnvironmentPlacementsShape;
  },
);

/** Production: markers in SQLite. Needs the server's `SqlClient`. */
export const remoteEnvironmentPlacementsLayer = Layer.effect(
  RemoteEnvironmentPlacements,
  Effect.flatMap(makeSqlCloudChildPlacementMarkers, makeRemoteEnvironmentPlacements),
);

/** Tests: markers in memory. */
export const remoteEnvironmentPlacementsMemoryLayer = Layer.effect(
  RemoteEnvironmentPlacements,
  Effect.flatMap(makeMemoryCloudChildPlacementMarkers, makeRemoteEnvironmentPlacements),
);
