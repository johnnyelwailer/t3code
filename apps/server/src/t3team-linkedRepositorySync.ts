/**
 * T3TeamLinkedRepositorySync - clones and fetches linked reference repositories in the
 * background, on demand: a user's "Sync now", an agent's `t3_linked_repository_sync`, a
 * delegation into a linked repository, an explicit main-repository choice. Nothing here syncs
 * on a timer.
 *
 * Jobs run in this service's own scope, not the HTTP request fiber that asked for them: a client
 * giving up on a request cannot interrupt a clone halfway. One job per checkout path (a second
 * request joins the running one), at most `LINKED_REPOSITORY_SYNC_CONCURRENCY` at a time. Each
 * outcome is written back to every reference manifest that asked for it.
 *
 * @module t3team-linkedRepositorySync
 */
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import { isSameRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { syncLinkedCheckout } from "./t3team-linkedRepositorySyncJob.ts";
import { recordLinkedRepositoryOutcome } from "./t3team-linkedRepositoryManifestEntry.ts";
import type {
  LinkedRepositoryBootstrapResult,
  LinkedRepositorySyncPhase,
} from "./t3team-project-repository-utils.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const LINKED_REPOSITORY_SYNC_CONCURRENCY = 3;

export type LinkedRepositorySyncRequest = {
  readonly referencesRoot: string;
  readonly url: string;
  readonly localPath: string;
  /** The branch the checkout should be on once synced; absent leaves it as it is. */
  readonly branch?: string;
};

type Job = {
  readonly url: string;
  readonly branch?: string;
  phase: LinkedRepositorySyncPhase;
  /** Every requester to record the outcome for: reference manifest → the URL it lists the
   * checkout under (a joined request may spell the same repository differently). */
  readonly requesters: Map<string, Set<string>>;
  readonly settled: Deferred.Deferred<void>;
};

export class T3TeamLinkedRepositorySync extends Context.Service<
  T3TeamLinkedRepositorySync,
  {
    /** Queues a clone/fetch and returns at once; joins a sync of the same checkout in flight. */
    readonly request: (input: LinkedRepositorySyncRequest) => Effect.Effect<void>;
    /** The phase of the checkout's queued or running sync; `undefined` when idle. */
    readonly phase: (localPath: string) => LinkedRepositorySyncPhase | undefined;
    /** Resolves once the checkout's sync in flight (if any) has been recorded. */
    readonly awaitSettled: (localPath: string) => Effect.Effect<void>;
    /** Serializes reference-manifest read-modify-write cycles with job outcomes. */
    readonly withManifestLock: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  }
>()("t3/t3team-linkedRepositorySync/T3TeamLinkedRepositorySync") {}

const make = Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const context = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | VcsProcess | SourceControlRepositoryService
  >();
  const permits = yield* Semaphore.make(LINKED_REPOSITORY_SYNC_CONCURRENCY);
  const manifestLock = yield* Semaphore.make(1);
  const withManifestLock = manifestLock.withPermits(1);
  const jobs = new Map<string, Job>();

  const sync = (job: Job, localPath: string) =>
    syncLinkedCheckout({
      url: job.url,
      localPath,
      ...(job.branch ? { branch: job.branch } : {}),
      onPhase: (phase) => (job.phase = phase),
    });

  const record = (job: Job, localPath: string, outcome: Effect.Success<ReturnType<typeof sync>>) =>
    Effect.gen(function* () {
      const syncedAt = DateTime.formatIso(yield* DateTime.now);
      for (const [referencesRoot, urls] of job.requesters) {
        for (const url of urls) {
          const entry: LinkedRepositoryBootstrapResult = isSameRepository(url, job.url)
            ? {
                url,
                localPath,
                ...outcome,
                ...(job.branch ? { branch: job.branch } : {}),
                syncedAt,
              }
            : {
                url,
                localPath,
                status: "failed",
                error: "Another linked repository already uses this reference path.",
                syncedAt,
              };
          yield* withManifestLock(recordLinkedRepositoryOutcome(referencesRoot, entry)).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to record linked repository sync outcome.", cause),
            ),
          );
        }
      }
    });

  const run = (job: Job, localPath: string) =>
    permits
      .withPermits(1)(
        Effect.flatMap(sync(job, localPath), (outcome) => record(job, localPath, outcome)),
      )
      .pipe(
        Effect.catchCause((cause) => Effect.logError("Linked repository sync crashed.", cause)),
        Effect.ensuring(
          Effect.suspend(() => {
            jobs.delete(localPath);
            return Deferred.succeed(job.settled, undefined);
          }),
        ),
        Effect.provide(context),
      );

  // Uninterruptible: a registered job is always forked, so an aborted request cannot leave a
  // job in the map that never runs (and blocks every later request for that checkout).
  const request = (input: LinkedRepositorySyncRequest) =>
    Effect.uninterruptible(
      Effect.suspend(() => {
        const running = jobs.get(input.localPath);
        if (running) {
          const urls = running.requesters.get(input.referencesRoot) ?? new Set<string>();
          running.requesters.set(input.referencesRoot, urls.add(input.url));
          return Effect.void;
        }
        const job: Job = {
          url: input.url,
          ...(input.branch ? { branch: input.branch } : {}),
          phase: "queued",
          requesters: new Map([[input.referencesRoot, new Set([input.url])]]),
          settled: Deferred.makeUnsafe<void>(),
        };
        jobs.set(input.localPath, job);
        return Effect.forkIn(run(job, input.localPath), scope).pipe(Effect.asVoid);
      }),
    );

  return T3TeamLinkedRepositorySync.of({
    request,
    phase: (localPath) => jobs.get(localPath)?.phase,
    awaitSettled: (localPath) =>
      Effect.suspend(() => {
        const job = jobs.get(localPath);
        return job ? Deferred.await(job.settled) : Effect.void;
      }),
    withManifestLock,
  });
});

export const T3TeamLinkedRepositorySyncLive = Layer.effect(T3TeamLinkedRepositorySync, make);
