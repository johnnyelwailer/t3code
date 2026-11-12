import type { CloudSession, ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useCallback, useEffect, useMemo } from "react";

import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";
import { cloudSessionDisplayName } from "~/components/cloud/t3team-cloudSessionDisplayName";
import { useServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlagOr } from "~/t3team/t3team-useFeatureFlag";
import type { BranchToolbarEnvironmentSelector } from "~/components/BranchToolbarEnvironmentSelector";
import { useEnvironments } from "~/state/environments";
import { getCloudSessionLocal } from "~/cloud/t3team-cloudSessionLocalStore";
import {
  beginCloudSessionCreate,
  clearCloudSessionTarget,
  type CloudSessionCreateOptions,
  failCloudSessionCreate,
  resolveCloudSessionCreating,
  selectCloudSessionTarget,
  useCloudSessionTarget,
} from "~/cloud/t3team-cloudSessionTargetStore";
import { CLOUD_SESSION_CREATING_ID } from "~/cloud/t3team-cloudSessionTargetLogic";
import { planCloudSessionRebind } from "~/cloud/t3team-cloudSessionRebind";
import {
  useCloudSessionMachineProjects,
  useCloudSessionProjectKey,
} from "~/cloud/t3team-useCloudSessionProjectFollow";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { isTerminalCloudSessionPhase, runOnCloudSessions } from "./t3team-cloudSessionSplit";
import { resolveCloudSessionCreateProjectOutcome } from "./t3team-cloudSessionCreateProject";
import { runOnSelectionStatus } from "./t3team-runOnSelection";

type SelectorProps = ComponentProps<typeof BranchToolbarEnvironmentSelector>;
type CloudSelectorProps = Pick<
  SelectorProps,
  | "pendingCloudSessions"
  | "onCreateCloudSession"
  | "onSetupProjectMachine"
  | "cloudSessionCreatePending"
  | "cloudSessionSetupPending"
  | "selectedCloudSession"
  | "cloudSessionSelectionStatus"
  | "onSelectCloudSession"
  | "cloudProjectNotHere"
  | "onStopCloudSession"
  | "onDeleteCloudSession"
  | "cloudSessionActionPending"
  | "onCloudMenuOpenChange"
  | "onCloudMenuHint"
  | "onSetupCloudSessions"
  | "cloudSessionProject"
  | "connectedEnvironmentIds"
  | "cloudEnvironmentIds"
  | "onConnectCloudSession"
>;

/**
 * The "Run on" menu's cloud entries. `scopeKey` (draft id or thread key) owns the
 * optimistic cloud preference so create/pick flips the trigger immediately. `draftId` is the
 * unsent draft a pick may retarget; a started thread passes none and is never moved.
 */
export function useT3TeamRunOnCloudSessionProps(
  projectRef: ScopedProjectRef | null,
  scopeKey: string | null = null,
  draftId: string | null = null,
): {
  readonly available: boolean;
  readonly selectorProps: CloudSelectorProps;
} {
  const cloudSessions = useCloudSessionController({ scopeKey });
  const navigate = useNavigate();
  const { available, configured, sessions, onCreate, createPending, createPendingSetup } =
    cloudSessions;
  const { primaryEnvironmentId } = cloudSessions;
  const {
    onCloudMenuOpenChange,
    onCloudMenuHint,
    onSessionAction,
    onSessionSecondaryAction,
    onSessionDeleteAction,
    stopDeleteEnabled,
    pendingSessionId,
    pendingKind,
    connectFailure: _connectFailure,
  } = cloudSessions;
  // "Move to" connects a ready session first; the connected machine then lists as a choice.
  const onConnectCloudSession = useCallback(
    (session: CloudSession) => {
      if (session.phase === "ready") onSessionAction(session);
    },
    [onSessionAction],
  );
  // The row's Stop verb: a ready machine is stopped (reversible), one still coming up is
  // cancelled. Delete is offered only when the server has the stop/delete feature on.
  const stopCloudSession = useCallback(
    (session: CloudSession) => {
      if (session.phase === "ready") onSessionSecondaryAction(session);
      else if (!isTerminalCloudSessionPhase(session.phase)) onSessionAction(session);
    },
    [onSessionAction, onSessionSecondaryAction],
  );
  const onStopCloudSession = stopDeleteEnabled ? stopCloudSession : undefined;
  const onDeleteCloudSession = stopDeleteEnabled ? onSessionDeleteAction : undefined;
  const cloudSessionActionPending =
    pendingSessionId !== null &&
    (pendingKind === "stop" || pendingKind === "delete" || pendingKind === "cancel")
      ? {
          sessionId: pendingSessionId,
          kind: pendingKind === "delete" ? ("delete" as const) : ("stop" as const),
        }
      : null;
  const target = useCloudSessionTarget(scopeKey);
  const projectKey = useCloudSessionProjectKey(projectRef);
  const pendingCloudSessions = useMemo(
    () => (available ? runOnCloudSessions(sessions) : []),
    [available, sessions],
  );
  const projectEnvironmentId = projectRef?.environmentId ?? null;
  const projectId = projectRef?.projectId ?? null;
  const machineProjects = useCloudSessionMachineProjects();
  // This computer's server resolves the project to clone; a cloud copy maps to its local twin.
  const createProject = useMemo(
    () =>
      resolveCloudSessionCreateProjectOutcome({
        projectRef:
          projectId !== null && projectEnvironmentId !== null
            ? { environmentId: projectEnvironmentId, projectId }
            : null,
        primaryEnvironmentId,
        projectKey,
        projects: machineProjects,
      }),
    [machineProjects, primaryEnvironmentId, projectEnvironmentId, projectId, projectKey],
  );
  const cloudSessionProject = createProject.kind === "project" ? createProject.project : undefined;
  // Only on cloud machines: a session started here would have no project at all, so the menu says
  // so and offers the clone. The dialog opens from that click, never on its own.
  const cloudProjectNotHere = useMemo(() => {
    if (createProject.kind !== "elsewhere" || primaryEnvironmentId === null) return null;
    const { projectRef: cloudCopy } = createProject;
    return {
      // Loaded on the click: the dialog module is heavy and only this one action needs it.
      onClone: () =>
        void import("~/components/AddProjectToMachineDialog").then(({ openAddProjectToMachine }) =>
          openAddProjectToMachine({
            projectRef: cloudCopy,
            targetEnvironmentId: primaryEnvironmentId,
          }),
        ),
    };
  }, [createProject, primaryEnvironmentId]);

  // Create answered: replace the creating sentinel with the real session id/label.
  useEffect(() => {
    if (scopeKey === null || target?.sessionId !== CLOUD_SESSION_CREATING_ID) return;
    const session = getCloudSessionLocal()?.session ?? null;
    // Still the previous create's session: the reducer ignores it too, this skips the call.
    if (session === null || session.sessionId === target.staleLocalSessionId) return;
    resolveCloudSessionCreating(scopeKey, session.sessionId, cloudSessionDisplayName(session));
  }, [scopeKey, sessions, target?.sessionId, target?.staleLocalSessionId]);

  // A create that never reaches a session leaves the entry it selected in place, with Retry: what
  // it must not do is quietly hand the thread back to the session picked before it.
  const onCreateCloudSession = useCallback(
    (options?: CloudSessionCreateOptions) =>
      beginCloudSessionCreate(
        {
          scopeKey,
          projectKey,
          staleLocalSessionId: getCloudSessionLocal()?.session.sessionId ?? null,
        },
        options,
        () =>
          onCreate(
            cloudSessionProject?.projectId,
            scopeKey !== null && options?.selectAsTarget !== false
              ? { onFailed: () => failCloudSessionCreate(scopeKey) }
              : undefined,
          ),
      ),
    [cloudSessionProject, onCreate, projectKey, scopeKey],
  );

  const serverConfig = useServerConfig();
  const machineSetupEnabled = readServerFeatureFlagOr(
    serverConfig,
    "MACHINE_SETUP",
    serverConfig?.machineSetup === true,
  );
  const onSetupProjectMachine = useCallback(
    (options?: CloudSessionCreateOptions) =>
      beginCloudSessionCreate(
        {
          scopeKey,
          projectKey,
          staleLocalSessionId: getCloudSessionLocal()?.session.sessionId ?? null,
        },
        options,
        () => onCreate(cloudSessionProject?.projectId, { machineSetup: true }),
      ),
    [cloudSessionProject, onCreate, projectKey, scopeKey],
  );

  const { environments } = useEnvironments();
  const connectedKey = environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => environment.environmentId)
    .join("\u0000");
  const connectedEnvironmentIds = useMemo(
    () => new Set(connectedKey === "" ? [] : connectedKey.split("\u0000")),
    [connectedKey],
  );
  const cloudKey = environments
    .filter((environment) => environment.entry.target._tag === "BrokerConnectionTarget")
    .map((environment) => environment.environmentId)
    .join("\u0000");
  const cloudEnvironmentIds = useMemo(
    () => new Set(cloudKey === "" ? [] : cloudKey.split("\u0000")),
    [cloudKey],
  );
  const onSetupCloudSessions = useCallback(() => {
    void navigate({ to: "/settings/connections" });
  }, [navigate]);

  // Picking a ready session also rebinds what reads a machine: its environment is reconnected
  // (the registration may still name the session that ended on it), and an unsent draft moves
  // onto that machine's copy of the project, so provider status, install and send follow.
  const onSelectCloudSession = useCallback(
    (session: CloudSession) => {
      if (scopeKey === null) return;
      selectCloudSessionTarget({
        scopeKey,
        sessionId: session.sessionId,
        label: cloudSessionDisplayName(session),
        projectKey,
      });
      const store = useComposerDraftStore.getState();
      const key = draftId === null ? null : DraftId.make(draftId);
      const draft = key === null ? null : store.getDraftSession(key);
      const plan = planCloudSessionRebind({
        session,
        connectedEnvironmentIds,
        projectsOnMachines: machineProjects,
        projectKey,
        draftEnvironmentId: draft === null || draft.promotedTo ? null : draft.environmentId,
      });
      if (plan.connect) onConnectCloudSession(session);
      if (plan.projectRef !== null && key !== null) {
        store.setDraftThreadContext(key, {
          projectRef: plan.projectRef,
          environmentSelection: "manual",
          loadBalancedEnvironmentId: null,
        });
      }
    },
    [
      connectedEnvironmentIds,
      draftId,
      machineProjects,
      onConnectCloudSession,
      projectKey,
      scopeKey,
    ],
  );

  // Prefer live session label when the list has caught up.
  const selectedCloudSession = useMemo(() => {
    if (target === null) return null;
    const live = sessions.find((session) => session.sessionId === target.sessionId);
    return {
      sessionId: target.sessionId,
      label: live ? cloudSessionDisplayName(live) : target.label,
    };
  }, [sessions, target]);
  const cloudSessionSelectionStatus = useMemo(() => {
    if (target === null) return undefined;
    const live = sessions.find((session) => session.sessionId === target.sessionId) ?? null;
    return runOnSelectionStatus(target, live?.phase ?? null);
  }, [sessions, target]);

  const selectorProps = useMemo<CloudSelectorProps>(
    () =>
      !available
        ? {}
        : configured
          ? {
              pendingCloudSessions,
              connectedEnvironmentIds,
              cloudEnvironmentIds,
              onCreateCloudSession,
              ...(machineSetupEnabled && cloudSessionProject ? { onSetupProjectMachine } : {}),
              cloudSessionCreatePending: createPending,
              cloudSessionSetupPending: createPendingSetup,
              ...(cloudSessionProject ? { cloudSessionProject } : {}),
              selectedCloudSession,
              ...(cloudSessionSelectionStatus ? { cloudSessionSelectionStatus } : {}),
              onSelectCloudSession,
              cloudProjectNotHere,
              ...(onStopCloudSession ? { onStopCloudSession } : {}),
              ...(onDeleteCloudSession ? { onDeleteCloudSession } : {}),
              cloudSessionActionPending,
              onCloudMenuOpenChange,
              onCloudMenuHint,
              onConnectCloudSession,
            }
          : { onSetupCloudSessions },
    [
      available,
      cloudProjectNotHere,
      cloudSessionActionPending,
      cloudSessionProject,
      cloudSessionSelectionStatus,
      configured,
      connectedEnvironmentIds,
      cloudEnvironmentIds,
      createPending,
      createPendingSetup,
      onCloudMenuOpenChange,
      onCloudMenuHint,
      onConnectCloudSession,
      onStopCloudSession,
      onDeleteCloudSession,
      machineSetupEnabled,
      onCreateCloudSession,
      onSetupProjectMachine,
      onSelectCloudSession,
      onSetupCloudSessions,
      pendingCloudSessions,
      selectedCloudSession,
    ],
  );
  return { available, selectorProps };
}

/** Clear the optimistic cloud preference when the user picks a non-cloud machine. */
export function clearCloudSessionTargetIfLocal(
  scopeKey: string | null,
  environmentId: string,
  cloudEnvironmentIds: ReadonlySet<string> | undefined,
): void {
  if (scopeKey === null) return;
  if (cloudEnvironmentIds?.has(environmentId) === true) return;
  clearCloudSessionTarget(scopeKey);
}
