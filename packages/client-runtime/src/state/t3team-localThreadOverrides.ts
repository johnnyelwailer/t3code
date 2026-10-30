import type {
  EnvironmentId,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";

import type { SupervisorConnectionState } from "../connection/model.ts";
import { isSessionEndedFailure } from "../connection/t3team-brokerConnection.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import * as Persistence from "../platform/persistence.ts";
import { createRuntimeCommand } from "./runtime.ts";

/**
 * Settling or deleting a thread must work even when its environment cannot be asked: a cloud
 * session that ended leaves its threads in the local cache with nobody to answer the command.
 * These overrides are applied to the local view of the shell (and to the cached shell, so a
 * restart keeps them) instead of going through the environment's server.
 */
export type LocalThreadOverride = "settled" | "removed";

/**
 * An override only speaks for the snapshot it was made against: a newer snapshot (a new session
 * on the same environment id) is authoritative and ends it. A resumed session at exactly the same
 * sequence keeps it until its next event.
 */
interface RecordedOverride {
  readonly override: LocalThreadOverride;
  readonly snapshotSequence: number;
}

/**
 * Whether the environment cannot be asked: its cloud session ended (the connection is parked on
 * `session_ended`, whatever phase a platform presents it as) or it is not in the catalog at all.
 * Anything else, such as an expired sign-in, a switched-off or a reconnecting environment, is
 * expected to answer again and keeps the normal path.
 */
export function isEnvironmentUnreachable(input: {
  readonly inCatalog: boolean;
  readonly state: SupervisorConnectionState | null;
}): boolean {
  if (!input.inCatalog) return true;
  return (
    input.state !== null &&
    input.state.phase === "blocked" &&
    isSessionEndedFailure(input.state.lastFailure)
  );
}

/**
 * Reads whether an environment cannot be asked, from anywhere (menus, handlers). An atom nobody
 * has mounted only ever answers its initial value, which would hide an ended session, so the set
 * of unreachable environments is one derived atom that stays mounted for the app's lifetime.
 */
export function createEnvironmentUnreachableReader(input: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly stateAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<AsyncResult.AsyncResult<SupervisorConnectionState, unknown>>;
}) {
  const unreachableAtom = Atom.make((get) => {
    const unreachable = new Set<EnvironmentId>();
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      const state = Option.getOrNull(AsyncResult.value(get(input.stateAtom(environmentId))));
      if (isEnvironmentUnreachable({ inCatalog: true, state })) unreachable.add(environmentId);
    }
    return unreachable as ReadonlySet<EnvironmentId>;
  }).pipe(Atom.withLabel("environment-unreachable-set"));
  input.registry.mount(unreachableAtom);
  return (environmentId: EnvironmentId): boolean => {
    const catalog = input.registry.get(input.catalogValueAtom);
    if (!catalog.isReady) return false;
    return (
      !catalog.entries.has(environmentId) || input.registry.get(unreachableAtom).has(environmentId)
    );
  };
}

function settledLocally(thread: OrchestrationV2ThreadShell, now: DateTime.Utc) {
  return {
    ...thread,
    pendingRuntimeRequest: null,
    settledOverride: "settled" as const,
    settledAt: thread.settledOverride === "settled" ? (thread.settledAt ?? now) : now,
    unsettledAt: null,
    activeOrderKey: null,
    pinnedAt: null,
    pinOrderKey: null,
    snoozedAt: null,
    snoozedUntil: null,
  };
}

export function applyLocalThreadOverrides(
  snapshot: OrchestrationV2ShellSnapshot,
  overrides: ReadonlyMap<ThreadId, LocalThreadOverride>,
  now: DateTime.Utc,
): OrchestrationV2ShellSnapshot {
  if (overrides.size === 0) return snapshot;
  const removed = (thread: { readonly id: ThreadId }) => overrides.get(thread.id) === "removed";
  return {
    ...snapshot,
    threads: snapshot.threads
      .filter((thread) => !removed(thread))
      .map((thread) =>
        overrides.get(thread.id) === "settled" ? settledLocally(thread, now) : thread,
      ),
    archivedThreads: snapshot.archivedThreads.filter((thread) => !removed(thread)),
  };
}

export type LocalThreadOverrideInput = {
  readonly threadId: ThreadId;
  readonly override: LocalThreadOverride;
};

export function createLocalThreadOverrides<R, E>(
  runtime: Atom.AtomRuntime<R, E>,
  sourceSnapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationV2ShellSnapshot | null>,
) {
  const overridesAtom = Atom.family((_environmentId: EnvironmentId) =>
    Atom.make<ReadonlyMap<ThreadId, RecordedOverride>>(new Map()).pipe(Atom.keepAlive),
  );
  const snapshotAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => {
      const snapshot = get(sourceSnapshotAtom(environmentId));
      const recorded = get(overridesAtom(environmentId));
      if (snapshot === null || recorded.size === 0) return snapshot;
      const current = new Map<ThreadId, LocalThreadOverride>();
      for (const [threadId, entry] of recorded) {
        if (entry.snapshotSequence >= snapshot.snapshotSequence)
          current.set(threadId, entry.override);
      }
      return applyLocalThreadOverrides(snapshot, current, DateTime.nowUnsafe());
    }),
  );

  /** Never fails: the view changes first, persisting it to the cache is best effort. */
  const persist = Effect.fn("LocalThreadOverrides.persist")(function* (
    environmentId: EnvironmentId,
    input: LocalThreadOverrideInput,
  ) {
    const store = yield* Effect.serviceOption(Persistence.EnvironmentCacheStore);
    if (Option.isNone(store)) return;
    const cache = store.value;
    const cached = yield* cache.loadShell(environmentId);
    if (Option.isSome(cached)) {
      const { loadPullRequests: _deferred, ...snapshot } = cached.value;
      yield* cache.saveShell(
        environmentId,
        applyLocalThreadOverrides(
          snapshot,
          new Map([[input.threadId, input.override]]),
          DateTime.nowUnsafe(),
        ),
      );
    }
    if (input.override === "removed") {
      yield* cache.removeThread(environmentId, input.threadId);
    }
  });

  const command = createRuntimeCommand(runtime, {
    label: "environment-data:commands:thread:local-override",
    execute: (
      target: { readonly environmentId: EnvironmentId; readonly input: LocalThreadOverrideInput },
      registry,
    ) => {
      const snapshotSequence =
        registry.get(sourceSnapshotAtom(target.environmentId))?.snapshotSequence ?? 0;
      registry.update(overridesAtom(target.environmentId), (current) =>
        new Map(current).set(target.input.threadId, {
          override: target.input.override,
          snapshotSequence,
        }),
      );
      return persist(target.environmentId, target.input).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Could not persist the local thread change.").pipe(
            Effect.annotateLogs({
              environmentId: target.environmentId,
              threadId: target.input.threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        ),
        Effect.as({ sequence: 0 }),
      );
    },
  });

  return { snapshotAtom, command };
}
