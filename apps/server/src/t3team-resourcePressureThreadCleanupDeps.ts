/**
 * V2 wiring for the per-thread resource cleanup (`t3team-resourcePressureThreadCleanup.ts`).
 *
 * - Live session: the thread's active provider thread → its provider session,
 *   only when `ProviderSessionManagerV2.get` holds a live runtime (it never
 *   opens or recovers one).
 * - Jobs: `controlThreadJobs` (`kind: "list"`); no session or a runtime
 *   without job control simply has no jobs.
 * - Stop: `provider-session.detach` through `ThreadManagementService.dispatch`,
 *   the same command archive/settle use to release a provider process.
 *
 * @module t3team-resourcePressureThreadCleanupDeps
 */
import { CommandId, type ProviderJobSummary, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProviderSessionManagerV2 } from "./orchestration-v2/ProviderSessionManager.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { controlThreadJobs } from "./t3team-providerJobControl.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import type {
  ThreadCleanupDeps,
  ThreadCleanupSession,
} from "./t3team-resourcePressureThreadCleanup.ts";

export const makeThreadCleanupDeps = (
  base: Pick<ThreadCleanupDeps, "enabled" | "serverPid" | "telemetry" | "signal">,
) =>
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const sessions = yield* ProviderSessionManagerV2;

    const liveSession = (threadId: ThreadId): Effect.Effect<ThreadCleanupSession | null> =>
      Effect.gen(function* () {
        const records = yield* threads.getThreadRecords(threadId, ["providerThreads"]);
        const providerThread = records.providerThreads.find(
          (candidate) => candidate.id === records.thread.activeProviderThreadId,
        );
        const providerSessionId = providerThread?.providerSessionId;
        if (providerThread === undefined || providerSessionId == null) return null;
        const runtime = yield* sessions.get(providerSessionId);
        return Option.isNone(runtime)
          ? null
          : { providerSessionId, provider: providerThread.driver };
      }).pipe(Effect.catchCause(() => Effect.succeed(null)));

    const listJobs = (threadId: ThreadId): Effect.Effect<ReadonlyArray<ProviderJobSummary>> =>
      controlThreadJobs({ threadId, request: { kind: "list" } }).pipe(
        Effect.map((result): ReadonlyArray<ProviderJobSummary> =>
          result.kind === "jobs" ? result.jobs : [],
        ),
        Effect.provideService(ThreadManagementService, threads),
        Effect.provideService(ProviderSessionManagerV2, sessions),
        Effect.catchCause(() => Effect.succeed([] as ReadonlyArray<ProviderJobSummary>)),
      );

    const stopSession: ThreadCleanupDeps["stopSession"] = ({ threadId, providerSessionId }) =>
      threads
        .dispatch({
          type: "provider-session.detach",
          commandId: CommandId.make(`t3team-resource-cleanup:${t3teamRandomUUID()}`),
          threadId,
          providerSessionId,
          reason: "Stopped by resource cleanup.",
        })
        .pipe(
          Effect.as(true),
          Effect.catchCause(() => Effect.succeed(false)),
        );

    const deps: ThreadCleanupDeps = { ...base, liveSession, listJobs, stopSession };
    return deps;
  });
