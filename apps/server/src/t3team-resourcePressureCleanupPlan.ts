/**
 * Pure plan for the one-click per-thread resource cleanup (flag
 * `NEXI_FF_RESOURCE_PRESSURE`): which of ONE thread's processes get SIGINT,
 * and why. Identity comes only from the thread's own agent session — the
 * running jobs its runtime registry reports (with PIDs) — and each PID must
 * pass the same gate as the diagnostics panel's Stop: present in a fresh
 * process scan, a signalable backend category, and a ppid chain that ends at
 * this server. Never a name or pattern. Anything that fails is listed as
 * skipped with its reason, never signaled.
 *
 * The agent session itself is stopped through its provider (`thread.session.stop`):
 * no provider adapter reports its CLI's PID, so the provider's own stop is the
 * only per-thread identity for that process tree.
 *
 * @module t3team-resourcePressureCleanupPlan
 */
import type {
  ProviderJobSummary,
  ResourcePressureCleanupPlan,
  ResourcePressureCleanupSkipped,
  ResourcePressureCleanupTarget,
  ResourceTelemetrySnapshot,
  ThreadId,
} from "@t3tools/contracts";

import { canSignalCategory } from "./diagnostics/ProcessDiagnostics.ts";
import { descendsFrom, indexByPid } from "./t3team-resourcePressureClasses.ts";

export function buildThreadCleanupPlan(input: {
  readonly threadId: ThreadId;
  readonly jobs: ReadonlyArray<ProviderJobSummary>;
  readonly session: { readonly provider: string } | null;
  /** Null when the fresh scan failed: no lineage proof, so nothing becomes a target. */
  readonly telemetry: ResourceTelemetrySnapshot | null;
  readonly serverPid: number;
}): ResourcePressureCleanupPlan {
  const byPid = input.telemetry === null ? new Map() : indexByPid(input.telemetry);
  const targets: ResourcePressureCleanupTarget[] = [];
  const skipped: ResourcePressureCleanupSkipped[] = [];
  for (const job of input.jobs) {
    if (job.state !== "running") continue;
    const label = `job ${job.jobId} (${job.command})`;
    if (input.telemetry === null) {
      skipped.push({ label, reason: "the process scan failed; lineage cannot be verified" });
      continue;
    }
    if (job.pid === undefined) {
      skipped.push({ label, reason: "the runtime reported no PID for this job" });
      continue;
    }
    const entry = byPid.get(job.pid);
    if (entry === undefined) {
      skipped.push({ label, reason: `PID ${job.pid} is not in the current process scan` });
      continue;
    }
    if (
      job.pid === input.serverPid ||
      !canSignalCategory(entry.category) ||
      !descendsFrom(job.pid, input.serverPid, byPid)
    ) {
      skipped.push({ label, reason: `PID ${job.pid} is not a verified descendant of this server` });
      continue;
    }
    targets.push({
      pid: job.pid,
      startTimeMs: entry.identity.startTimeMs,
      jobId: job.jobId,
      command: job.command,
      residentBytes: entry.residentBytes,
      reason: `background job ${job.jobId} of this thread's agent session`,
    });
  }
  return {
    threadId: input.threadId,
    enabled: true,
    targets,
    skipped,
    agentSession:
      input.session === null
        ? null
        : {
            provider: input.session.provider,
            reason: `this thread's ${input.session.provider} agent session — stopped through its provider (its CLI exits)`,
          },
  };
}

/** Confirmed identities that are still targets in a fresh plan; the rest are reported, not signaled. */
export function partitionConfirmedTargets(
  plan: ResourcePressureCleanupPlan,
  confirmed: ReadonlyArray<{ readonly pid: number; readonly startTimeMs: number }>,
): {
  readonly verified: ReadonlyArray<ResourcePressureCleanupTarget>;
  readonly rejected: ReadonlyArray<{ readonly pid: number; readonly reason: string }>;
} {
  const verified: ResourcePressureCleanupTarget[] = [];
  const rejected: { pid: number; reason: string }[] = [];
  for (const identity of confirmed) {
    const target = plan.targets.find(
      (candidate) =>
        candidate.pid === identity.pid && candidate.startTimeMs === identity.startTimeMs,
    );
    if (target === undefined) {
      rejected.push({
        pid: identity.pid,
        reason: "no longer a verified job process of this thread; not signaled",
      });
    } else {
      verified.push(target);
    }
  }
  return { verified, rejected };
}
