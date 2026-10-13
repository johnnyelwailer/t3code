/**
 * The live facts about one queued cloud send, read the same way by the app-level flusher (to act)
 * and by the composer banner and thread card (to show where it is). Pure.
 */
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { CloudSession, EnvironmentId } from "@t3tools/contracts";

import type { DraftSessionState } from "~/composerDraftStore";
import {
  deriveLogicalProjectKeyFromSettings,
  type selectProjectGroupingSettings,
} from "~/logicalProject";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";

export interface CloudQueuedSendFacts {
  readonly session: CloudSession | null;
  readonly environmentId: EnvironmentId | null;
  /** The session's machine is a connected environment on this client. */
  readonly machineConnected: boolean;
  /** The draft's project on that machine, once it has synced there. */
  readonly project: EnvironmentProject | null;
  /** The draft's thread is already known on that machine. */
  readonly threadExists: boolean;
}

export function resolveCloudQueuedSendFacts(input: {
  readonly queued: CloudQueuedSend;
  readonly draft: Pick<DraftSessionState, "logicalProjectKey" | "threadId">;
  readonly sessions: readonly CloudSession[];
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly connection: { readonly phase: string };
  }>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly threadShells: ReadonlyArray<Pick<EnvironmentThreadShell, "environmentId" | "id">>;
  readonly groupingSettings: ReturnType<typeof selectProjectGroupingSettings>;
}): CloudQueuedSendFacts {
  const session = input.sessions.find((item) => item.sessionId === input.queued.sessionId) ?? null;
  const environmentId = (session?.environmentId ?? null) as EnvironmentId | null;
  if (environmentId === null) {
    return { session, environmentId, machineConnected: false, project: null, threadExists: false };
  }
  return {
    session,
    environmentId,
    machineConnected: input.environments.some(
      (environment) =>
        environment.environmentId === environmentId && environment.connection.phase === "connected",
    ),
    project:
      input.projects.find(
        (candidate) =>
          candidate.environmentId === environmentId &&
          deriveLogicalProjectKeyFromSettings(candidate, input.groupingSettings) ===
            input.draft.logicalProjectKey,
      ) ?? null,
    threadExists: input.threadShells.some(
      (shell) => shell.environmentId === environmentId && shell.id === input.draft.threadId,
    ),
  };
}
