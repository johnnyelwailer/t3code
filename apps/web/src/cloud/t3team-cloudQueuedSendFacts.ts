/**
 * The live facts about one queued cloud send, read the same way by the app-level flusher (to act)
 * and by the composer banner and thread card (to show where it is). Pure.
 *
 * The send binds to the same project on the session's machine as ChatView's machine list does:
 * the session's own project first (`resolveCloudSessionOwnProject`), else the one that groups
 * with the draft's project (`logicalProjectPerEnvironment`). A "No project" draft binds to the
 * machine's own scratch project, which the flusher opens there when it is not listed yet.
 */
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { DraftSessionState } from "~/composerDraftStore";
import {
  deriveLogicalProjectKeyFromSettings,
  type selectProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import { type CloudProjectWait, classifyCloudProjectWait } from "./t3team-cloudProjectWait";
import type { CloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import {
  type MachineProjectBinding,
  resolveMachineOwnProject,
} from "./t3team-cloudSessionMachineProject";
import {
  logicalProjectPerEnvironment,
  projectCwdOf,
  resolveCloudSessionOwnProject,
  targetFollowsProject,
} from "./t3team-cloudSessionOwnProject";

export interface CloudQueuedSendFacts {
  readonly session: CloudSession | null;
  readonly environmentId: EnvironmentId | null;
  /** The session's machine is a connected environment on this client. */
  readonly machineConnected: boolean;
  /** The draft's project on that machine, once it is there. */
  readonly project: EnvironmentProject | null;
  /** What the draft's project is still waiting on there; null once it is there. */
  readonly projectWait: CloudProjectWait | null;
  /** How `project` was found: by the machine's own welcome id, or by folder / repository match. */
  readonly projectResolvedBy: MachineProjectBinding | null;
  /** The draft is a "No project" thread: its project on the machine is that machine's scratch. */
  readonly scratch: boolean;
  /** The draft's thread is already known on that machine. */
  readonly threadExists: boolean;
}

interface FactsEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: string };
  readonly serverConfig?:
    | {
        readonly scratchWorkspaceRoot?: string | null;
        readonly cwd?: string;
        readonly projectFromCwd?: boolean;
      }
    | null
    | undefined;
}

export function resolveCloudQueuedSendFacts(input: {
  readonly queued: CloudQueuedSend;
  readonly draft: Pick<
    DraftSessionState,
    "environmentId" | "projectId" | "logicalProjectKey" | "threadId"
  >;
  readonly sessions: readonly CloudSession[];
  readonly environments: ReadonlyArray<FactsEnvironment>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly threadShells: ReadonlyArray<Pick<EnvironmentThreadShell, "environmentId" | "id">>;
  readonly groupingSettings: ReturnType<typeof selectProjectGroupingSettings>;
  /** The project id an environment's welcome names as its own (`serverEnvironment.welcome`). */
  readonly bootstrapProjectIdOf?: ((environmentId: EnvironmentId) => ProjectId | null) | undefined;
}): CloudQueuedSendFacts {
  const { draft, projects, environments } = input;
  const session = input.sessions.find((item) => item.sessionId === input.queued.sessionId) ?? null;
  const environmentId = (session?.environmentId ?? null) as EnvironmentId | null;
  const environmentOf = (id: EnvironmentId) =>
    environments.find((environment) => environment.environmentId === id);
  const composerProject =
    projects.find((p) => p.environmentId === draft.environmentId && p.id === draft.projectId) ??
    null;
  const scratch =
    composerProject !== null &&
    isScratchProject(
      composerProject,
      environmentOf(composerProject.environmentId)?.serverConfig?.scratchWorkspaceRoot,
    );
  if (environmentId === null) {
    return {
      session,
      environmentId,
      machineConnected: false,
      project: null,
      projectWait: null,
      projectResolvedBy: null,
      scratch,
      threadExists: false,
    };
  }
  const machine = environmentOf(environmentId);
  const projectKey =
    composerProject === null
      ? draft.logicalProjectKey
      : deriveLogicalProjectKeyFromSettings(composerProject, input.groupingSettings);
  const projectOnMachine = (): {
    readonly project: EnvironmentProject | null;
    readonly by: MachineProjectBinding | null;
  } => {
    if (scratch) {
      const root = machine?.serverConfig?.scratchWorkspaceRoot;
      return {
        project:
          projects.find((p) => p.environmentId === environmentId && isScratchProject(p, root)) ??
          null,
        by: null,
      };
    }
    if (input.queued.sendInMachineProject === true) {
      // The user's choice: the machine's own project, whatever repository it is.
      const own = resolveMachineOwnProject({
        environmentId,
        bootstrapProjectId: input.bootstrapProjectIdOf?.(environmentId) ?? null,
        cwd: projectCwdOf(machine?.serverConfig),
        projects,
      });
      return { project: own.project ?? null, by: own.by };
    }
    const own = resolveCloudSessionOwnProject({
      target: { sessionId: input.queued.sessionId, projectKey: input.queued.projectKey ?? null },
      project: composerProject,
      projectKey,
      sessions: input.sessions,
      serverCwdOf: (id) => projectCwdOf(environmentOf(id)?.serverConfig),
      ...(input.bootstrapProjectIdOf === undefined
        ? {}
        : { bootstrapProjectIdOf: input.bootstrapProjectIdOf }),
      projects,
    });
    const entry = logicalProjectPerEnvironment(
      projects,
      (p) => deriveLogicalProjectKeyFromSettings(p, input.groupingSettings) === projectKey,
      own,
    ).find((candidate) => candidate.environmentId === environmentId);
    const found =
      entry === undefined
        ? null
        : (projects.find((p) => p.environmentId === environmentId && p.id === entry.projectId) ??
          null);
    // Only the session's own project can have come by the welcome id; a grouping match is by
    // folder / repository.
    return {
      project: found,
      by:
        found === null
          ? null
          : own?.projectId === found.id
            ? (own.resolvedBy ?? "folder")
            : "folder",
    };
  };
  const { project, by: projectResolvedBy } = projectOnMachine();
  return {
    session,
    environmentId,
    machineConnected: machine?.connection.phase === "connected",
    project,
    projectResolvedBy,
    projectWait:
      project === null
        ? classifyCloudProjectWait({
            environmentId,
            scratch,
            machineSettingsLoaded: machine?.serverConfig != null,
            expectedCwd: targetFollowsProject(
              { projectKey: input.queued.projectKey ?? null },
              composerProject,
              projectKey,
            )
              ? projectCwdOf(machine?.serverConfig)
              : null,
            scratchRoot: machine?.serverConfig?.scratchWorkspaceRoot ?? null,
            composer: composerProject,
            projects: projects.filter((p) => p.environmentId === environmentId),
          })
        : null,
    scratch,
    threadExists: input.threadShells.some(
      (shell) => shell.environmentId === environmentId && shell.id === draft.threadId,
    ),
  };
}
