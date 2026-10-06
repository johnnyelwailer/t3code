import type { CloudSession, ScopedProjectRef } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useCallback, useMemo } from "react";

import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";
import type { BranchToolbarEnvironmentSelector } from "~/components/BranchToolbarEnvironmentSelector";
import { formatHoldDuration } from "./t3team-cloudSessionHoldFormat";
import { runOnCloudSessions } from "./t3team-cloudSessionSplit";

type SelectorProps = ComponentProps<typeof BranchToolbarEnvironmentSelector>;
type CloudSelectorProps = Pick<
  SelectorProps,
  | "pendingCloudSessions"
  | "onCreateCloudSession"
  | "cloudSessionDurationLabel"
  | "onCloudSessionAction"
  | "onCloudMenuOpenChange"
  | "onSetupCloudSessions"
  | "cloudSessionProject"
>;

/**
 * The "Run on" menu's cloud entries, shared by every surface that renders the environment
 * selector (the composer strip's `BranchToolbar`, the thread details panel): provisioning and
 * the most recent failed session, "New cloud session" when a provider is configured, otherwise
 * "Set up cloud sessions". `available` is false without a primary environment, and then no cloud
 * affordance is passed at all. Values are memoised — the composer strip re-renders per keystroke.
 *
 * A session runs in the project's machine only when the project lives where sessions are created
 * (the primary environment); a thread on a remote environment starts a plain one.
 */
export function useT3TeamRunOnCloudSessionProps(projectRef: ScopedProjectRef | null): {
  readonly available: boolean;
  readonly selectorProps: CloudSelectorProps;
} {
  const cloudSessions = useCloudSessionController();
  const navigate = useNavigate();
  const { available, configured, sessions, durationSeconds, onCreate } = cloudSessions;
  const { primaryEnvironmentId } = cloudSessions;
  const { onSessionAction, onCloudMenuOpenChange } = cloudSessions;
  const pendingCloudSessions = useMemo(
    () => (available ? runOnCloudSessions(sessions) : []),
    [available, sessions],
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
  const onCreateCloudSession = useCallback(
    () => onCreate(durationSeconds, cloudSessionProject?.projectId),
    [cloudSessionProject, durationSeconds, onCreate],
  );
  const onCloudSessionAction = useCallback(
    (session: CloudSession) => onSessionAction(session, cloudSessionProject?.projectId),
    [cloudSessionProject, onSessionAction],
  );
  // Unconfigured: the entry leaves for the Connections settings, where provisioning lives.
  const onSetupCloudSessions = useCallback(() => {
    void navigate({ to: "/settings/connections" });
  }, [navigate]);
  const selectorProps = useMemo<CloudSelectorProps>(
    () =>
      !available
        ? {}
        : configured
          ? {
              pendingCloudSessions,
              onCreateCloudSession,
              cloudSessionDurationLabel: formatHoldDuration(durationSeconds),
              ...(cloudSessionProject ? { cloudSessionProject } : {}),
              onCloudSessionAction,
              onCloudMenuOpenChange,
            }
          : { onSetupCloudSessions },
    [
      available,
      cloudSessionProject,
      configured,
      durationSeconds,
      onCloudMenuOpenChange,
      onCloudSessionAction,
      onCreateCloudSession,
      onSetupCloudSessions,
      pendingCloudSessions,
    ],
  );
  return { available, selectorProps };
}
