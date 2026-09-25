/**
 * Dispatch backoff (flag `NEXI_FF_RESOURCE_PRESSURE`): while the latest
 * resource-pressure sample says `stopSpawning` (level critical), agent-driven
 * spawns — `t3team.thread.start_child` and `t3team.orchestration.run` — are
 * refused with an explanatory error instead of adding load to a host heading
 * for OOM. Work already running is untouched.
 *
 * It reads the monitor's cached sample (never triggers a scan). With the flag
 * off the report is disabled and the gate always admits.
 *
 * @module t3team-resourcePressureGate
 */
import type { ResourcePressureSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";
import type { T3TeamWorkflowRunToolHandlers } from "./t3team-toolBrokerWorkflowRunTools.ts";

export function spawnRefusalMessage(snapshot: ResourcePressureSnapshot, action: string): string {
  const reasons = snapshot.reasons.length > 0 ? ` (${snapshot.reasons.join("; ")})` : "";
  return (
    `Not starting ${action}: host memory pressure is critical${reasons}. ` +
    "Let running work finish, then check t3team_resource_pressure and retry once stopSpawning is false."
  );
}

/** Run `spawn` unless the latest sample says stop spawning; then fail with the refusal message. */
export function gateSpawnOnPressure<A, E>(
  monitor: ResourcePressureMonitorShape | undefined,
  action: string,
  spawn: Effect.Effect<A, E>,
): Effect.Effect<A, E | string> {
  if (monitor === undefined) return spawn;
  return monitor.report.pipe(
    Effect.flatMap((report): Effect.Effect<A, E | string> => {
      const snapshot = report.snapshot;
      return report.enabled && snapshot !== null && snapshot.stopSpawning
        ? Effect.fail(spawnRefusalMessage(snapshot, action))
        : spawn;
    }),
  );
}

export const gateWorkflowRunTools = (
  monitor: ResourcePressureMonitorShape | undefined,
  handlers: T3TeamWorkflowRunToolHandlers,
): T3TeamWorkflowRunToolHandlers => ({
  runWorkflow: (args) =>
    gateSpawnOnPressure(monitor, "an orchestration", handlers.runWorkflow(args)),
});
