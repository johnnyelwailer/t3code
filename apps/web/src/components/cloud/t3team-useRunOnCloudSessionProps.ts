import type { CloudSession, ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useCallback, useEffect, useMemo } from "react";

import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";
import { cloudSessionDisplayName } from "~/components/cloud/t3team-cloudSessionDisplayName";
import { useServerConfig } from "~/t3team/t3team-serverState";
import type { BranchToolbarEnvironmentSelector } from "~/components/BranchToolbarEnvironmentSelector";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useEnvironments } from "~/state/environments";
import { getCloudSessionLocal } from "~/cloud/t3team-cloudSessionLocalStore";
import {
  clearCloudSessionTarget,
  resolveCloudSessionCreating,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
  useCloudSessionTarget,
} from "~/cloud/t3team-cloudSessionTargetStore";
import { CLOUD_SESSION_CREATING_ID } from "~/cloud/t3team-cloudSessionTargetLogic";
import { useCloudSessionProjectKey } from "~/cloud/t3team-useCloudSessionProjectFollow";
import { runOnCloudSessions } from "./t3team-cloudSessionSplit";

const DISMISSED_FAILURES_KEY = "t3code:cloud-session-dismissed-failures";
const DISMISSED_FAILURES_LIMIT = 20;
const DismissedFailuresSchema = Schema.Array(Schema.String);

type SelectorProps = ComponentProps<typeof BranchToolbarEnvironmentSelector>;
type CloudSelectorProps = Pick<
  SelectorProps,
  | "pendingCloudSessions"
  | "onCreateCloudSession"
  | "onSetupProjectMachine"
  | "cloudSessionCreatePending"
  | "cloudSessionSetupPending"
  | "selectedCloudSession"
  | "onSelectCloudSession"
  | "onDismissCloudSession"
  | "onCloudMenuOpenChange"
  | "onSetupCloudSessions"
  | "cloudSessionProject"
  | "connectedEnvironmentIds"
  | "cloudEnvironmentIds"
>;

/**
 * The "Run on" menu's cloud entries. `scopeKey` (draft id or thread key) owns the
 * optimistic cloud preference so create/pick flips the trigger immediately.
 */
export function useT3TeamRunOnCloudSessionProps(
  projectRef: ScopedProjectRef | null,
  scopeKey: string | null = null,
): {
  readonly available: boolean;
  readonly selectorProps: CloudSelectorProps;
} {
  const cloudSessions = useCloudSessionController();
  const navigate = useNavigate();
  const { available, configured, sessions, onCreate, createPending, createPendingSetup } =
    cloudSessions;
  const { primaryEnvironmentId } = cloudSessions;
  const { onCloudMenuOpenChange, connectFailure: _connectFailure } = cloudSessions;
  const target = useCloudSessionTarget(scopeKey);
  const projectKey = useCloudSessionProjectKey(projectRef);
  const [dismissed, setDismissed] = useLocalStorage(
    DISMISSED_FAILURES_KEY,
    [] as ReadonlyArray<string>,
    DismissedFailuresSchema,
  );
  const dismissedIds = useMemo(() => new Set(dismissed), [dismissed]);
  const pendingCloudSessions = useMemo(
    () => (available ? runOnCloudSessions(sessions, dismissedIds) : []),
    [available, dismissedIds, sessions],
  );
  const onDismissCloudSession = useCallback(
    (session: CloudSession) =>
      setDismissed((current) => [session.sessionId, ...current].slice(0, DISMISSED_FAILURES_LIMIT)),
    [setDismissed],
  );
  const projectEnvironmentId = projectRef?.environmentId ?? null;
  const projectId = projectRef?.projectId ?? null;
  const cloudSessionProject = useMemo(
    () =>
      projectId !== null &&
      projectEnvironmentId !== null &&
      projectEnvironmentId === primaryEnvironmentId
        ? { environmentId: projectEnvironmentId, projectId }
        : undefined,
    [primaryEnvironmentId, projectEnvironmentId, projectId],
  );

  // Create answered: replace the creating sentinel with the real session id/label.
  useEffect(() => {
    if (scopeKey === null || target?.sessionId !== CLOUD_SESSION_CREATING_ID) return;
    const session = getCloudSessionLocal()?.session ?? null;
    if (session === null) return;
    resolveCloudSessionCreating(scopeKey, session.sessionId, cloudSessionDisplayName(session));
  }, [scopeKey, sessions, target?.sessionId]);

  const onCreateCloudSession = useCallback(() => {
    if (scopeKey !== null) selectCloudSessionCreating(scopeKey, undefined, projectKey);
    onCreate(cloudSessionProject?.projectId);
  }, [cloudSessionProject, onCreate, projectKey, scopeKey]);

  const machineSetupEnabled = useServerConfig()?.machineSetup === true;
  const onSetupProjectMachine = useCallback(() => {
    if (scopeKey !== null) selectCloudSessionCreating(scopeKey, undefined, projectKey);
    onCreate(cloudSessionProject?.projectId, { machineSetup: true });
  }, [cloudSessionProject, onCreate, projectKey, scopeKey]);

  const onSelectCloudSession = useCallback(
    (session: CloudSession) => {
      if (scopeKey === null) return;
      selectCloudSessionTarget({
        scopeKey,
        sessionId: session.sessionId,
        label: cloudSessionDisplayName(session),
        projectKey,
      });
    },
    [projectKey, scopeKey],
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

  // Prefer live session label when the list has caught up.
  const selectedCloudSession = useMemo(() => {
    if (target === null) return null;
    const live = sessions.find((session) => session.sessionId === target.sessionId);
    return {
      sessionId: target.sessionId,
      label: live ? cloudSessionDisplayName(live) : target.label,
    };
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
              onSelectCloudSession,
              onDismissCloudSession,
              onCloudMenuOpenChange,
            }
          : { onSetupCloudSessions },
    [
      available,
      cloudSessionProject,
      configured,
      connectedEnvironmentIds,
      cloudEnvironmentIds,
      createPending,
      createPendingSetup,
      onCloudMenuOpenChange,
      machineSetupEnabled,
      onCreateCloudSession,
      onSetupProjectMachine,
      onDismissCloudSession,
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
