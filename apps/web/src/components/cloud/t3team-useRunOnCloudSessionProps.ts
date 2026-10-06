import type { CloudSession, ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useCallback, useMemo } from "react";

import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";
import type { BranchToolbarEnvironmentSelector } from "~/components/BranchToolbarEnvironmentSelector";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { runOnCloudSessions } from "./t3team-cloudSessionSplit";

const DISMISSED_FAILURES_KEY = "t3code:cloud-session-dismissed-failures";
const DISMISSED_FAILURES_LIMIT = 20;
const DismissedFailuresSchema = Schema.Array(Schema.String);

type SelectorProps = ComponentProps<typeof BranchToolbarEnvironmentSelector>;
type CloudSelectorProps = Pick<
  SelectorProps,
  | "pendingCloudSessions"
  | "onCreateCloudSession"
  | "cloudSessionCreatePending"
  | "onCloudSessionAction"
  | "onDismissCloudSession"
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
  const { available, configured, sessions, onCreate, createPending } = cloudSessions;
  const { primaryEnvironmentId } = cloudSessions;
  const { onSessionAction, onCloudMenuOpenChange } = cloudSessions;
  // A failure surfaced in the menu stays dismissed once the user closed it (kept per browser; the
  // list only ever surfaces the newest session, so the stored ids never grow past a handful).
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
  const onCreateCloudSession = useCallback(
    () => onCreate(cloudSessionProject?.projectId),
    [cloudSessionProject, onCreate],
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
              cloudSessionCreatePending: createPending,
              ...(cloudSessionProject ? { cloudSessionProject } : {}),
              onCloudSessionAction: onSessionAction,
              onDismissCloudSession,
              onCloudMenuOpenChange,
            }
          : { onSetupCloudSessions },
    [
      available,
      cloudSessionProject,
      configured,
      createPending,
      onCloudMenuOpenChange,
      onCreateCloudSession,
      onDismissCloudSession,
      onSessionAction,
      onSetupCloudSessions,
      pendingCloudSessions,
    ],
  );
  return { available, selectorProps };
}
