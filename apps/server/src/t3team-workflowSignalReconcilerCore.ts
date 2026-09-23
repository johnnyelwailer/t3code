/**
 * The signal-source reconciler core (GHE #332, design 42 §5) — the controller loop as a plain
 * function: derive the DESIRED live source set from the journaled registrations, start what is
 * missing, stop what is orphaned. Split from the Effect Live layer (in
 * t3team-workflowSignalReconciler.ts) so the reconcile + delivery-trust-boundary logic stays
 * testable without services or timers.
 *
 * Nobody in a body calls start/stop: a suspended workflow is not running, so the live set
 * cannot be commanded. It is derived — at boot, whenever a registration appears or disappears
 * (the `signal.register` verb pokes the reconciler), and on a periodic sweep that also cleans
 * settled bindings and expired inbox entries. This is what makes instances survive restarts
 * (desired is recomputed from the journal), self-clean (a terminal run drops out of desired and
 * its source stops), and crash-tolerant (a dead source is just `actual` drifting from
 * `desired`; the next reconcile fixes it).
 *
 * Every started instance gets a minted delivery capability: its `ctx.emit` is the delivery
 * port itself, restricted to the signals the source's declaration emits and schema-decoded at
 * the boundary — ambient delivery would let anything drive someone else's run (design 42 §7).
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  BUILTIN_SIGNALS,
  decodeSignalPayload,
  signalInstanceKey,
  type Signal,
  type SignalEmit,
  type SignalSourceInstance,
} from "@t3team/sdk";
import {
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestMerged,
  ScmChangeRequestReviewActivity,
  WorkItemUpdated,
} from "@t3team/sdk";

import type { WorkflowSignalDeliveryShape } from "./t3team-workflowSignalDelivery.ts";
import type { WorkflowSignalSourceCatalog } from "./t3team-workflowSignalCatalog.ts";
import type { WorkflowSignalStoreShape } from "./persistence/Services/WorkflowSignalStore.ts";
import { startSignalSweep } from "./t3team-workflowSignalSweepTimer.ts";

/** The delivery trust boundary per source name: only the declared signals may be emitted. */
const EMITS_BY_SOURCE: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  (
    [
      [
        "scm.change-request.watch",
        [
          ScmChangeRequestMerged.name,
          ScmChangeRequestClosed.name,
          ScmChangeRequestDraftReady.name,
        ],
      ],
      ["scm.change-request.checks", [ScmChangeRequestChecksConcluded.name]],
      ["scm.change-request.review", [ScmChangeRequestReviewActivity.name]],
      ["work-item.updates", [WorkItemUpdated.name]],
    ] as const
  ).map(([name, signals]) => [name, new Set(signals)]),
);

/** The reconciler's returned controller (the live-set state + operations). */
export type ReconcilerCore = {
  readonly reconcile: () => Promise<void>;
  readonly sweep: () => Promise<void>;
  readonly stop: () => void;
  readonly stopAll: () => Promise<void>;
};

/** The minted `ctx.emit`: declared-signals gate + schema decode, then the delivery port. */
export function makeMintedEmit(input: {
  readonly sourceName: string;
  readonly paramsHash: string;
  readonly delivery: WorkflowSignalDeliveryShape;
}): SignalEmit {
  const declaredSignals = EMITS_BY_SOURCE[input.sourceName] ?? new Set<string>();
  const signalByName = new Map(BUILTIN_SIGNALS.map((s) => [s.name, s]));
  return async <Payload>(
    signal: Signal<Payload>,
    key: string,
    payload: Payload,
  ): Promise<void> => {
    if (!declaredSignals.has(signal.name)) {
      throw new Error(
        `Source '${input.sourceName}' emitted undeclared signal '${signal.name}'.`,
      );
    }
    const declared = signalByName.get(signal.name);
    if (declared === undefined) {
      throw new Error(`Unknown built-in signal '${signal.name}'.`);
    }
    const validated = await decodeSignalPayload(declared, payload);
    await Effect.runPromise(
      input.delivery.emit({
        sourceName: input.sourceName,
        paramsHash: input.paramsHash,
        signalName: signal.name,
        key,
        payload: validated,
      }),
    );
  };
}

/** The reconcile loop: desired = registrations of live runs; start missing, stop orphaned. */
export function makeReconcilerCore(input: {
  readonly catalog: WorkflowSignalSourceCatalog;
  readonly delivery: WorkflowSignalDeliveryShape;
  readonly store: WorkflowSignalStoreShape;
  readonly sweepMs: number;
  /** The durable inbox GC cutoff (ISO): entries older than it are purged by the sweep. */
  readonly inboxCutoffIso: () => string;
  readonly nowIso: () => string;
  readonly log: (message: string, fields?: unknown) => Effect.Effect<void>;
  /** Tests run with the timer off; the Live layer keeps the periodic sweep on. */
  readonly startTimer?: boolean;
}): ReconcilerCore {
  const live = new Map<string, SignalSourceInstance>();
  const starting = new Set<string>();

  const startInstance = async (
    instanceKey: string,
    instance: { sourceName: string; paramsHash: string; params: unknown },
  ): Promise<void> => {
    starting.add(instanceKey);
    try {
      const handle = await input.catalog.start(instance.sourceName, {
        params: instance.params,
        emit: makeMintedEmit({
          sourceName: instance.sourceName,
          paramsHash: instance.paramsHash,
          delivery: input.delivery,
        }),
        getCursor: async () => {
          const cursor = await Effect.runPromise(input.store.getCursor(instanceKey));
          return Option.isSome(cursor) ? cursor.value.cursorValue : null;
        },
        setCursor: async (cursorValue) => {
          await Effect.runPromise(
            input.store.upsertCursor({
              instanceKey,
              cursorValue,
              updatedAt: input.nowIso(),
            }),
          );
        },
      });
      live.set(instanceKey, handle);
    } catch (error) {
      await Effect.runPromise(
        input.log("signal source start failed", { instanceKey, error: String(error) }),
      );
      // A failed start stays out of `live`; the next sweep retries. A persistent failure (bad
      // params, missing auth) retries at most once per sweep interval — bounded by design.
    } finally {
      starting.delete(instanceKey);
    }
  };

  const reconcile = async (): Promise<void> => {
    const rows = await Effect.runPromise(input.store.listLiveRegistrations());
    const desired = new Map<string, { sourceName: string; paramsHash: string; params: unknown }>();
    for (const row of rows) {
      const key = signalInstanceKey(row.sourceName, row.paramsHash);
      if (!desired.has(key)) {
        desired.set(key, {
          sourceName: row.sourceName,
          paramsHash: row.paramsHash,
          params: row.params,
        });
      }
    }
    // Start what is missing (deduped against in-flight starts).
    for (const [key, instance] of desired) {
      if (!live.has(key) && !starting.has(key)) {
        void startInstance(key, instance);
      }
    }
    // Stop what is orphaned: no live run holds a registration on the instance anymore.
    for (const [key, handle] of live) {
      if (!desired.has(key)) {
        live.delete(key);
        try {
          await handle.stop?.();
        } catch {
          // idempotent teardown may still fail; the instance is logically dead
        }
      }
    }
  };

  const sweep = async (): Promise<void> => {
    await reconcile();
    await Effect.runPromise(input.store.purgeTerminalRegistrations());
    await Effect.runPromise(
      input.store.deleteDeliveredInboxEntriesOlderThan(input.inboxCutoffIso()),
    );
  };

  let sweepTimer: ReturnType<typeof startSignalSweep> | undefined;
  if (input.startTimer !== false) {
    sweepTimer = startSignalSweep(sweep, input.sweepMs);
  }
  const stop = (): void => {
    sweepTimer?.stop();
    sweepTimer = undefined;
  };

  const stopAll = async (): Promise<void> => {
    stop();
    for (const handle of live.values()) {
      try {
        await handle.stop?.();
      } catch {
        // best-effort teardown at shutdown
      }
    }
    live.clear();
  };

  return { reconcile, sweep, stop, stopAll };
}
