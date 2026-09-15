/**
 * The signal-source reconciler service (GHE #332, design 42 §5) — the controller loop that
 * derives the LIVE SET of source instances from the journaled registrations and reconciles it
 * against what is actually running. The reconcile / emit-boundary / cursor logic lives in
 * t3team-workflowSignalReconcilerCore.ts; this layer is the thin Effect wrapper: services, the
 * boot cross-check, the boot reconcile, the sweep cadence, and the shutdown finalizer.
 *
 *   desired = { (source, params) : some live run holds a registration on it }
 *   reconcile(desired, actual) → start what is missing, stop what is orphaned
 *
 * Instances are poked back to life promptly by the `signal.register` verb (which upserts the
 * binding and calls `reconcile`), survive restarts (the boot reconcile recomputes desired from
 * the journal), self-clean (a terminal run drops out of desired and its source stops), and
 * catch up after crashes (each source's durable cursor bridges the host-down window).
 */

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as EffectPath from "effect/Path";
import * as EffectFileSystem from "effect/FileSystem";

import { AtlassianIntegrationProvider } from "@t3tools/integrations-atlassian";

import { T3TeamWorkflowSignalDelivery } from "./t3team-workflowSignalDelivery.ts";
import {
  assertCatalogCoversDeclarations,
  makeWorkflowSignalSourceCatalog,
} from "./t3team-workflowSignalCatalog.ts";
import { WorkflowSignalStore } from "./persistence/Services/WorkflowSignalStore.ts";
import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { makeReconcilerCore } from "./t3team-workflowSignalReconcilerCore.ts";
import {
  providerForAccount,
  providerForPersistedAuths,
} from "./t3team-atlassian-auth-store.ts";
import * as ServerConfig from "./config.ts";

/** The periodic sweep cadence: catch orphaned instances + GC without hammering the DB. */
export const WORKFLOW_SIGNAL_SWEEP_MS = 60_000;
/** Delivered inbox entries older than this are GC'd by the sweep (design 42 §7: entries expire). */
export const WORKFLOW_SIGNAL_INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The ambient services the Atlassian auth read needs (provided by the app composition). */
type AtlassianAuthServices =
  | EffectFileSystem.FileSystem
  | EffectPath.Path
  | ServerConfig.ServerConfig;

/** WorkflowSignalReconcilerShape - the reconciler's API: poke-driven + sweep-driven reconcile. */
export interface WorkflowSignalReconcilerShape {
  /** Reconcile the live source set against the desired set (idempotent; safe to call from a
   * registration poke). */
  readonly reconcile: () => Promise<void>;
  /** Periodic sweep: reconcile + terminal-binding purge + inbox GC. */
  readonly sweep: () => Promise<void>;
  /** Stop the sweep timer (shutdown). */
  readonly stop: () => void;
  /** Stop every live instance (host shutdown finalizer). */
  readonly stopAll: () => Promise<void>;
}

/** T3TeamWorkflowSignalReconciler - service tag for the signal-source reconciler. */
export class T3TeamWorkflowSignalReconciler extends Context.Service<
  T3TeamWorkflowSignalReconciler,
  WorkflowSignalReconcilerShape
>()("t3/t3team-workflowSignalReconciler/T3TeamWorkflowSignalReconciler") {}

export const T3TeamWorkflowSignalReconcilerLive = Layer.effect(
  T3TeamWorkflowSignalReconciler,
  Effect.gen(function* () {
    const store = yield* WorkflowSignalStore;
    const delivery = yield* T3TeamWorkflowSignalDelivery;
    const pullRequestService = yield* PullRequestService;
    // The work-item source's per-tick auth resolution reuses the ambient host context (the
    // same narrowing the pack driver bridge uses): the Atlassian auth read needs the services
    // the app composition provides ambiently to this layer.
    const ambient = yield* Effect.context<never>();
    const resolveWorkItemProvider = (accountId?: string) => {
      const context = ambient as Context.Context<AtlassianAuthServices>;
      return Effect.runPromiseWith(context)(
        accountId !== undefined ? providerForAccount(accountId) : providerForPersistedAuths(),
      ).then(
        (provider) => (provider instanceof AtlassianIntegrationProvider ? provider : undefined),
        () => undefined,
      );
    };
    const catalog = makeWorkflowSignalSourceCatalog({
      pullRequestService,
      resolveWorkItemProvider,
    });
    // Loud boot cross-check: a renamed/missing catalog entry breaks boot, not a parked body.
    assertCatalogCoversDeclarations(catalog);

    const log = (message: string, fields?: unknown) =>
      Effect.logWarning(message, fields as Record<string, unknown>);

    const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());
    const core = makeReconcilerCore({
      catalog,
      delivery,
      store,
      sweepMs: WORKFLOW_SIGNAL_SWEEP_MS,
      inboxCutoffIso: () =>
        DateTime.formatIso(
          DateTime.subtract(DateTime.nowUnsafe(), { milliseconds: WORKFLOW_SIGNAL_INBOX_TTL_MS }),
        ),
      nowIso,
      log,
    });

    // Boot reconcile: instances bound before this uptime come back now; each source's durable
    // cursor bridges the host-down window (the catch-up sweep inside its start).
    yield* Effect.promise(
      () =>
        core.reconcile().catch((error) => {
          void Effect.runPromise(
            log("boot reconcile failed", { error: String(error) }),
          );
        }),
    );

    yield* Effect.addFinalizer(() => Effect.promise(() => core.stopAll()));
    return {
      reconcile: () => core.reconcile(),
      sweep: () => core.sweep(),
      stop: () => core.stop(),
      stopAll: () => core.stopAll(),
    };
  }),
);
