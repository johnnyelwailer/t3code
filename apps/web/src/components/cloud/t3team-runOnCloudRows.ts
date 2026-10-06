import type { CloudSession } from "@t3tools/contracts";

import { dedupeRunOnEnvironments, type EnvironmentOption } from "../BranchToolbar.logic";
import { cloudSessionDisplayName } from "./t3team-cloudSessionDisplayName";

export interface RunOnCloudRow {
  readonly session: CloudSession;
  readonly name: string;
  /** The machine's environment, once it is connected here: the row is then a selectable choice. */
  readonly environment: EnvironmentOption | null;
}

/**
 * The "Run on" menu as one list: the machines that are not cloud sessions, then one row per cloud
 * session, connected or not. A connected session is never listed twice (as an environment and as
 * a session), and its environment carries the session's name, so the trigger shows it too.
 * Cloud environments skip the label de-duplication: each is its own machine, however it is named.
 */
export function runOnRows(
  environments: readonly EnvironmentOption[],
  sessions: readonly CloudSession[],
  activeEnvironmentId: EnvironmentOption["environmentId"],
): { readonly machines: EnvironmentOption[]; readonly cloud: RunOnCloudRow[] } {
  const sessionByEnvironment = new Map(
    sessions.flatMap((session) =>
      session.environmentId === undefined ? [] : [[session.environmentId, session] as const],
    ),
  );
  const cloudEnvironments = new Map<string, EnvironmentOption>();
  const others: EnvironmentOption[] = [];
  for (const environment of environments) {
    const session = sessionByEnvironment.get(environment.environmentId);
    if (session === undefined) others.push(environment);
    else
      cloudEnvironments.set(environment.environmentId, {
        ...environment,
        label: cloudSessionDisplayName(session),
      });
  }
  return {
    machines: dedupeRunOnEnvironments(others, activeEnvironmentId),
    cloud: sessions.map((session) => ({
      session,
      name: cloudSessionDisplayName(session),
      environment:
        session.environmentId === undefined
          ? null
          : (cloudEnvironments.get(session.environmentId) ?? null),
    })),
  };
}
