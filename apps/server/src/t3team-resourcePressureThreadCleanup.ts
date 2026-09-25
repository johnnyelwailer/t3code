/**
 * One-click per-thread resource cleanup (flag `NEXI_FF_RESOURCE_PRESSURE`):
 * `preview` builds the plan the confirm dialog shows (PIDs and why, see
 * `t3team-resourcePressureCleanupPlan.ts`); `execute` rebuilds it from a fresh
 * scan, SIGINTs exactly the confirmed identities that are still verified
 * (through `ProcessDiagnostics.signal`, which re-checks PID + start time and
 * the signal policy), then stops the thread's agent session through the
 * orchestration `thread.session.stop` command. Worktrees are never touched.
 *
 * @module t3team-resourcePressureThreadCleanup
 */
import {
  CommandId,
  type ProviderJobSummary,
  type ResourcePressureCleanupExecuteInput,
  type ResourcePressureCleanupPlan,
  type ResourcePressureCleanupResult,
  type ServerSignalProcessInput,
  type ServerSignalProcessResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProviderServiceShape } from "./provider/Services/ProviderService.ts";
import type * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildThreadCleanupPlan,
  partitionConfirmedTargets,
} from "./t3team-resourcePressureCleanupPlan.ts";

export interface ThreadCleanupDeps {
  readonly enabled: boolean;
  readonly serverPid: number;
  readonly telemetry: Pick<ResourceTelemetry.ResourceTelemetry["Service"], "refresh">;
  readonly providers: Pick<ProviderServiceShape, "jobControl" | "listSessions">;
  readonly signal: (input: ServerSignalProcessInput) => Effect.Effect<ServerSignalProcessResult>;
  readonly engine: Pick<OrchestrationEngineShape, "dispatch">;
}

const disabledPlan = (threadId: ThreadId): ResourcePressureCleanupPlan => ({
  threadId,
  enabled: false,
  targets: [],
  skipped: [],
  agentSession: null,
});

/** A runtime without job control, or a thread without a live session, simply has no jobs. */
const listJobs = (deps: ThreadCleanupDeps, threadId: ThreadId) =>
  deps.providers.jobControl({ threadId, request: { kind: "list" } }).pipe(
    Effect.map((result): ReadonlyArray<ProviderJobSummary> =>
      result.kind === "jobs" ? result.jobs : [],
    ),
    Effect.catch(() => Effect.succeed([] as ReadonlyArray<ProviderJobSummary>)),
  );

export const previewThreadCleanup = (
  deps: ThreadCleanupDeps,
  threadId: ThreadId,
): Effect.Effect<ResourcePressureCleanupPlan> => {
  if (!deps.enabled) return Effect.succeed(disabledPlan(threadId));
  return Effect.gen(function* () {
    const [jobs, sessions, telemetry] = yield* Effect.all(
      [
        listJobs(deps, threadId),
        deps.providers.listSessions(),
        deps.telemetry.refresh.pipe(Effect.option),
      ],
      { concurrency: "unbounded" },
    );
    const session = sessions.find((candidate) => candidate.threadId === threadId);
    return buildThreadCleanupPlan({
      threadId,
      jobs,
      session: session === undefined ? null : { provider: session.provider },
      telemetry: Option.getOrNull(telemetry),
      serverPid: deps.serverPid,
    });
  });
};

export const executeThreadCleanup = (
  deps: ThreadCleanupDeps,
  input: ResourcePressureCleanupExecuteInput,
): Effect.Effect<ResourcePressureCleanupResult> => {
  if (!deps.enabled) {
    return Effect.succeed({
      signaled: [],
      notSignaled: [],
      agentSessionStopped: false,
      message: "Resource pressure tools are disabled (NEXI_FF_RESOURCE_PRESSURE).",
    });
  }
  return Effect.gen(function* () {
    const plan = yield* previewThreadCleanup(deps, input.threadId);
    const { verified, rejected } = partitionConfirmedTargets(plan, input.targets);
    const signaled: number[] = [];
    const notSignaled = [...rejected];
    for (const target of verified) {
      const result = yield* deps.signal({
        pid: target.pid,
        startTimeMs: target.startTimeMs,
        signal: "SIGINT",
      });
      if (result.signaled) signaled.push(target.pid);
      else {
        notSignaled.push({
          pid: target.pid,
          reason: Option.getOrElse(result.message, () => "the process was not signaled"),
        });
      }
    }
    let agentSessionStopped = false;
    if (input.stopAgentSession && plan.agentSession !== null) {
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      agentSessionStopped = yield* deps.engine
        .dispatch({
          type: "thread.session.stop",
          commandId: CommandId.make(t3teamRandomUUID()),
          threadId: input.threadId,
          createdAt,
        })
        .pipe(
          Effect.as(true),
          Effect.catchCause(() => Effect.succeed(false)),
        );
    }
    const parts = [
      `${signaled.length} process(es) signaled`,
      ...(notSignaled.length > 0 ? [`${notSignaled.length} not signaled`] : []),
      ...(agentSessionStopped ? ["agent session stopped"] : []),
    ];
    return { signaled, notSignaled, agentSessionStopped, message: parts.join(" · ") };
  });
};
