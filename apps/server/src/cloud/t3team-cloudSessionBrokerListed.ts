import type { CloudSession } from "@t3tools/contracts";

import type { BrokerSession } from "./t3team-NexiBrokerClient.ts";
import type { CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

/**
 * The signed-in account's cloud sessions this server did not start: another of its devices (a phone,
 * another desktop) did. The broker lists every live session of the Entra owner (`GET /v1/sessions`),
 * so these are up and reachable through it; this server's own runs and claims list themselves.
 * Unnamed: the broker's label is the VM's host name, so the client names it by its start.
 */
export function brokerListedSessions(input: {
  readonly brokerSessions: ReadonlyArray<BrokerSession>;
  readonly knownRunIds: ReadonlySet<string>;
  readonly nowMs: number;
  readonly machineLabel: string;
  readonly repoRef: CloudSessionRepoRef;
}): ReadonlyArray<CloudSession> {
  return input.brokerSessions.flatMap((session) => {
    if (input.knownRunIds.has(session.runId) || !/^\d{1,20}$/.test(session.runId)) return [];
    const sinceMs = session.since ? Date.parse(session.since) : Number.NaN;
    const started = Number.isFinite(sinceMs) ? sinceMs : null;
    return [
      {
        sessionId: session.runId,
        providerKind: "github_actions",
        phase: "ready",
        elapsedSeconds:
          started === null ? 0 : Math.max(0, Math.floor((input.nowMs - started) / 1000)),
        remainingSeconds: null,
        machineLabel: input.machineLabel,
        failureReason: null,
        detailsUrl: `https://${input.repoRef.host}/${input.repoRef.owner}/${input.repoRef.repo}/actions/runs/${session.runId}`,
        ...(session.environmentId ? { environmentId: session.environmentId } : {}),
        ...(started === null || !session.since ? {} : { startedAt: session.since }),
        transport: "nexi_broker",
      } satisfies CloudSession,
    ];
  });
}
