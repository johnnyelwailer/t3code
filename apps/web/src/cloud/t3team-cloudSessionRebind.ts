/**
 * What picking a session under "Run on" rebinds beside the menu label: a connection still
 * registered to an ended session on the same environment id, and an unsent draft that still
 * names the project's old machine (provider status, install target and send read it).
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  type CloudSession,
  type ProjectId,
  type ScopedProjectRef,
} from "@t3tools/contracts";

/** One machine's copy of a project, keyed by the logical key the machine list groups by. */
export interface CloudSessionMachineProject {
  readonly environmentId: string;
  readonly projectId: ProjectId;
  readonly logicalKey: string;
}

export interface CloudSessionRebindPlan {
  /** Re-register the environment against this session, so a stale binding stops deciding. */
  readonly connect: boolean;
  /** The picked machine's own copy of the composer's project; null when it has none yet. */
  readonly projectRef: ScopedProjectRef | null;
}

const NOTHING: CloudSessionRebindPlan = { connect: false, projectRef: null };

export function planCloudSessionRebind(input: {
  readonly session: CloudSession;
  readonly connectedEnvironmentIds: ReadonlySet<string>;
  readonly projectsOnMachines: readonly CloudSessionMachineProject[];
  /** The composer project's logical key; null while the composer has no project. */
  readonly projectKey: string | null;
  /** Where the draft runs now. Null for a started thread, which is never retargeted. */
  readonly draftEnvironmentId: string | null;
}): CloudSessionRebindPlan {
  const environmentId = input.session.environmentId?.trim();
  if (
    input.session.phase !== "ready" ||
    environmentId === undefined ||
    environmentId.length === 0
  ) {
    return NOTHING;
  }
  const connect = !input.connectedEnvironmentIds.has(environmentId);
  if (
    input.projectKey === null ||
    input.draftEnvironmentId === null ||
    environmentId === input.draftEnvironmentId
  ) {
    return { connect, projectRef: null };
  }
  const project = input.projectsOnMachines.find(
    (item) => item.environmentId === environmentId && item.logicalKey === input.projectKey,
  );
  return {
    connect,
    projectRef:
      project === undefined
        ? null
        : scopeProjectRef(EnvironmentId.make(environmentId), project.projectId),
  };
}
