/**
 * One-click per-thread resource cleanup (flag `NEXI_FF_RESOURCE_PRESSURE`):
 * `preview` builds the plan the confirm dialog shows (PIDs and why, see
 * `t3team-resourcePressureCleanupPlan.ts`); `execute` rebuilds it from a fresh
 * scan, SIGINTs exactly the confirmed identities that are still verified
 * (through `ProcessDiagnostics.signal`, which re-checks PID + start time and
 * the signal policy), then detaches the thread's live agent session
 * (`provider-session.detach`, wired in `t3team-resourcePressureThreadCleanupDeps.ts`).
 * Worktrees are never touched.
 *
 * @module t3team-resourcePressureThreadCleanup
 */
import {
  type ProviderJobSummary,
  type ProviderSessionId,
  type ResourcePressureCleanupExecuteInput,
  type ResourcePressureCleanupPlan,
  type ResourcePressureCleanupResult,
  type ServerSignalProcessInput,
  type ServerSignalProcessResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type * as ResourceTelemetry from "./resourceTelemetry/ResourceTelemetry.ts";
import {
  buildThreadCleanupPlan,
  partitionConfirmedTargets,
} from "./t3team-resourcePressureCleanupPlan.ts";

/** The thread's live agent session (its provider process is running). */
export interface ThreadCleanupSession {
  readonly providerSessionId: ProviderSessionId;
  readonly provider: string;
}

export interface ThreadCleanupDeps {
  readonly enabled: boolean;
  readonly serverPid: number;
  readonly telemetry: Pick<ResourceTelemetry.ResourceTelemetry["Service"], "refresh">;
  readonly signal: (input: ServerSignalProcessInput) => Effect.Effect<ServerSignalProcessResult>;
  /** The live session's background jobs; empty when none or unsupported. */
  readonly listJobs: (threadId: ThreadId) => Effect.Effect<ReadonlyArray<ProviderJobSummary>>;
  readonly liveSession: (threadId: ThreadId) => Effect.Effect<ThreadCleanupSession | null>;
  /** Detaches the session (its CLI exits); false when the detach was rejected. */
  readonly stopSession: (input: {
    readonly threadId: ThreadId;
    readonly providerSessionId: ProviderSessionId;
  }) => Effect.Effect<boolean>;
}

const disabledPlan = (threadId: ThreadId): ResourcePressureCleanupPlan => ({
  threadId,
  enabled: false,
  targets: [],
  skipped: [],
  agentSession: null,
});

export const previewThreadCleanup = (
  deps: ThreadCleanupDeps,
  threadId: ThreadId,
): Effect.Effect<ResourcePressureCleanupPlan> => {
  if (!deps.enabled) return Effect.succeed(disabledPlan(threadId));
  return Effect.gen(function* () {
    const [jobs, session, telemetry] = yield* Effect.all(
      [
        deps.listJobs(threadId),
        deps.liveSession(threadId),
        deps.telemetry.refresh.pipe(Effect.option),
      ],
      { concurrency: "unbounded" },
    );
    return buildThreadCleanupPlan({
      threadId,
      jobs,
      session: session === null ? null : { provider: session.provider },
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
      // Re-resolve: the session the plan saw may have been replaced meanwhile.
      const session = yield* deps.liveSession(input.threadId);
      if (session !== null) {
        agentSessionStopped = yield* deps.stopSession({
          threadId: input.threadId,
          providerSessionId: session.providerSessionId,
        });
      }
    }
    const parts = [
      `${signaled.length} process(es) signaled`,
      ...(notSignaled.length > 0 ? [`${notSignaled.length} not signaled`] : []),
      ...(agentSessionStopped ? ["agent session stopped"] : []),
    ];
    return { signaled, notSignaled, agentSessionStopped, message: parts.join(" · ") };
  });
};
