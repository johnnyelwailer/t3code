import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ComposerSelectControl } from "./chat/ComposerControl";
import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import {
  type CloudSession,
  type EnvironmentId,
  type ProjectId,
  T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE,
} from "@t3tools/contracts";
import type { CloudSessionCreateOptions } from "~/cloud/t3team-cloudSessionTargetStore";
import { ScaleIcon, SettingsIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import type { EnvironmentOption } from "./BranchToolbar.logic";
import { cn } from "../lib/utils";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS,
} from "./chat/threadDetailsPanelStyles";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { RunOnCloudRow } from "./cloud/t3team-RunOnCloudRow";
import { runOnRows } from "./cloud/t3team-runOnCloudRows";
import { NewCloudSessionItem } from "./cloud/t3team-NewCloudSessionItem";
import {
  cloudSessionSelectValue,
  parseCloudSessionSelectValue,
} from "~/cloud/t3team-cloudSessionTargetLogic";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "./ui/select";

/**
 * Sentinel value for the "go set up cloud sessions" item, shown instead of the
 * create item when the server has no provider configured yet. Selecting it
 * leaves for the Connections settings, where the provisioning panel lives.
 */
const SETUP_CLOUD_SESSIONS_SELECT_VALUE = "__setup-cloud-sessions__";

export interface BranchToolbarEnvironmentSelectorBaseProps {
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  envLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
  displayMode?: "toolbar" | "panel";
  /**
   * Cloud sessions worth showing under "Cloud" while they are not ready: the
   * ones still provisioning (read-only, so the machine you just asked for is
   * visible where you pick a machine), ready ones, and the most recent failed one, with
   * its failure reason. t3team: each is listed once, by name (`t3team-runOnCloudRows.ts`).
   */
  pendingCloudSessions?: readonly CloudSession[];
  /**
   * t3team: every environment connected on this client, whatever its project. A cloud machine
   * connected without this thread's project is shown as unavailable, not as one to connect.
   */
  connectedEnvironmentIds?: ReadonlySet<string>;
  /** t3team: environments that are cloud machines; a finished one is not offered as a machine. */
  cloudEnvironmentIds?: ReadonlySet<string>;
  /**
   * Present when the server has a cloud provider configured: the menu offers a
   * one-click "New cloud session". Absent hides the action item entirely. In "Move to" mode it
   * is called with `selectAsTarget: false`: the started thread's composer keeps its machine.
   */
  onCreateCloudSession?: (options?: CloudSessionCreateOptions) => void;
  /**
   * New cloud session for a project with no machine: starts a session that sets one up on its own
   * thread. Absent when the flag is off, and then such a project starts a plain session.
   */
  onSetupProjectMachine?: (options?: CloudSessionCreateOptions) => void;
  /**
   * t3team: a create is on its way to the server (resolving the machine, dispatching), which takes
   * seconds before the session's own row exists; the create row shows it at once and stops a
   * second click from starting a second machine.
   */
  cloudSessionCreatePending?: boolean;
  /** True only while a "Set up a machine" create is the one in flight. */
  cloudSessionSetupPending?: boolean;
  /**
   * The project "New cloud session" starts for, when it lives on the environment sessions are
   * created on: the item then says which machine (devcontainer) the session will run in.
   */
  cloudSessionProject?: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId };
  /**
   * Present when a primary environment exists but the server has no provider
   * configured yet: the menu offers "Set up cloud sessions", which leaves for
   * the Connections settings instead of promising a machine. Mutually exclusive
   * with `onCreateCloudSession`.
   */
  onSetupCloudSessions?: () => void;
  /**
   * t3team: optimistic cloud preference for this composer — session id + label shown
   * in the trigger immediately, before the VM is Ready/connected.
   */
  selectedCloudSession?: { readonly sessionId: string; readonly label: string } | null;
  /** t3team: one-click select of a ready/provisioning session (connect waits for send). */
  onSelectCloudSession?: (session: CloudSession) => void;
  /** t3team: hides a surfaced failure from the menu once the user has seen it. */
  onDismissCloudSession?: (cloudSession: CloudSession) => void;
  /**
   * Drives background polling of the session list for as long as the menu is
   * open (a provisioning session changes phase every few seconds). Absent or
   * the menu closed: no polling.
   */
  onCloudMenuOpenChange?: (open: boolean) => void;
  /** t3team: connects a ready, not-yet-connected cloud session from the "Move to" menu. */
  onConnectCloudSession?: (session: CloudSession) => void;
}

/** t3team: a caller that offers "Move to" must also say whether the cloud can get the files. */
type BranchToolbarEnvironmentSelectorHandoffProps =
  | { onHandoffToEnvironment?: undefined; projectHasRemote?: undefined }
  | {
      /**
       * Present for a started thread in the details panel. The locked row becomes a "Move to"
       * menu; picking another machine continues the thread there (cloud handoff). Never routed
       * through `onEnvironmentChange`, which only re-targets a draft.
       */
      onHandoffToEnvironment: (environmentId: EnvironmentId) => void;
      /**
       * False when the thread's project has no `origin` remote. A cloud machine then has no way
       * to get its files, so "Move to" shows its cloud rows disabled with the reason the server
       * gives and offers no new cloud session.
       */
      projectHasRemote: boolean;
    };

export type BranchToolbarEnvironmentSelectorProps = BranchToolbarEnvironmentSelectorBaseProps &
  BranchToolbarEnvironmentSelectorHandoffProps;

export const BranchToolbarEnvironmentSelector = memo(function BranchToolbarEnvironmentSelector({
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  environmentId,
  availableEnvironments,
  onEnvironmentChange,
  displayMode = "toolbar",
  pendingCloudSessions,
  connectedEnvironmentIds,
  cloudEnvironmentIds,
  onCreateCloudSession,
  onSetupProjectMachine,
  cloudSessionCreatePending = false,
  cloudSessionSetupPending = false,
  cloudSessionProject,
  onSetupCloudSessions,
  selectedCloudSession = null,
  onSelectCloudSession,
  onDismissCloudSession,
  onCloudMenuOpenChange,
  onHandoffToEnvironment,
  onConnectCloudSession,
  projectHasRemote,
}: BranchToolbarEnvironmentSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  // A started thread cannot switch machines; in the panel it can move to one instead.
  const moveMode = envLocked && displayMode === "panel" && onHandoffToEnvironment !== undefined;
  const pickable = onEnvironmentChange !== undefined || moveMode;
  const cloudMoveBlockedReason =
    moveMode && projectHasRemote !== true ? T3TEAM_THREAD_HANDOFF_NO_GIT_REMOTE_MESSAGE : null;
  // The optimistic cloud pick belongs to a draft; a moving thread still shows where it runs.
  const optimisticCloudSession = moveMode ? null : selectedCloudSession;
  const hasCloudAffordance =
    onCreateCloudSession !== undefined || onSetupCloudSessions !== undefined;
  const { machines: runOnEnvironments, cloud: cloudRows } = useMemo(
    () =>
      runOnRows(availableEnvironments, pendingCloudSessions ?? [], environmentId, {
        connected: connectedEnvironmentIds,
        cloud: cloudEnvironmentIds,
      }),
    [
      availableEnvironments,
      cloudEnvironmentIds,
      connectedEnvironmentIds,
      environmentId,
      pendingCloudSessions,
    ],
  );
  const connectedCloudEnvironments = useMemo(
    () => cloudRows.flatMap((row) => (row.environment === null ? [] : [row.environment])),
    [cloudRows],
  );
  const activeEnvironment = useMemo(() => {
    if (optimisticCloudSession !== null) {
      return {
        environmentId: cloudSessionSelectValue(optimisticCloudSession.sessionId) as EnvironmentId,
        label: optimisticCloudSession.label,
        machine: "cloud" as const,
        isPrimary: false,
        projectId: null,
      };
    }
    return (
      [...runOnEnvironments, ...connectedCloudEnvironments].find(
        (env) => env.environmentId === environmentId,
      ) ?? null
    );
  }, [connectedCloudEnvironments, environmentId, runOnEnvironments, optimisticCloudSession]);

  const [menuOpen, setMenuOpen] = useState(false);

  const showAutoLabel = Boolean(autoEnvironmentLabel) && !moveMode;
  const selectValue = showAutoLabel
    ? "auto"
    : optimisticCloudSession !== null
      ? cloudSessionSelectValue(optimisticCloudSession.sessionId)
      : environmentId;

  const environmentItems = useMemo(
    () => [
      ...(onAutoEnvironment && !moveMode
        ? [{ value: "auto", label: autoEnvironmentLabel ?? "Auto balance" }]
        : []),
      ...(pickable
        ? [...runOnEnvironments, ...connectedCloudEnvironments].map((env) => ({
            value: env.environmentId,
            label: env.label,
          }))
        : []),
      ...(optimisticCloudSession !== null
        ? [
            {
              value: cloudSessionSelectValue(optimisticCloudSession.sessionId),
              label: optimisticCloudSession.label,
            },
          ]
        : []),
      ...(onSetupCloudSessions
        ? [{ value: SETUP_CLOUD_SESSIONS_SELECT_VALUE, label: "Set up cloud sessions" }]
        : []),
    ],
    [
      runOnEnvironments,
      connectedCloudEnvironments,
      autoEnvironmentLabel,
      onAutoEnvironment,
      moveMode,
      pickable,
      onSetupCloudSessions,
      optimisticCloudSession,
    ],
  );

  const handleValueChange = (value: string | null) => {
    if (value === null) return;
    if (value === SETUP_CLOUD_SESSIONS_SELECT_VALUE) {
      onSetupCloudSessions?.();
      return;
    }
    if (value === "auto") {
      onAutoEnvironment?.();
      return;
    }
    if (parseCloudSessionSelectValue(value) !== null) return;
    if (moveMode) {
      const blocked =
        cloudMoveBlockedReason !== null &&
        connectedCloudEnvironments.some((env) => env.environmentId === value);
      if (value !== environmentId && !blocked) onHandoffToEnvironment?.(value as EnvironmentId);
      return;
    }
    onEnvironmentChange?.(value as EnvironmentId);
  };

  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onCloudMenuOpenChange?.(open);
  };

  const selectCloudSession = (session: CloudSession) => {
    if (moveMode) onConnectCloudSession?.(session);
    else onSelectCloudSession?.(session);
    setMenuOpen(false);
    onCloudMenuOpenChange?.(false);
  };

  const createCloudSession = () => {
    onCreateCloudSession?.({ selectAsTarget: !moveMode });
    setMenuOpen(false);
    onCloudMenuOpenChange?.(false);
  };

  if (!moveMode && (envLocked || (onEnvironmentChange === undefined && !hasCloudAffordance))) {
    const lockedRow = (
      <span
        className={cn(
          "inline-flex h-7 min-w-0 max-w-full items-center gap-1 border border-transparent px-1.75 font-normal text-muted-foreground/70 text-xs sm:h-6",
          displayMode === "panel" && THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS,
        )}
        data-composer-context-control
      >
        <EnvironmentMachineIcon
          kind={activeEnvironment?.machine ?? "server"}
          className={displayMode === "panel" ? THREAD_DETAILS_PANEL_ICON_CLASS : "size-3 shrink-0"}
        />
        <ComposerContextLabel displayMode={displayMode}>
          {activeEnvironment?.label ?? "Run on"}
        </ComposerContextLabel>
      </span>
    );
    return (
      <Tooltip>
        <TooltipTrigger render={lockedRow} />
        <TooltipPopup>{activeEnvironment?.label ?? "Run on"}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Select
      modal={false}
      open={menuOpen}
      value={selectValue}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      items={environmentItems}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            displayMode === "panel" ? (
              // The row must be the Select's own trigger: a bare row button neither opens the
              // menu nor anchors it, so the popup would render unpositioned at (0, 0).
              <SelectPrimitive.Trigger
                render={<ThreadDetailsControl part="select" />}
                className="min-w-0 max-w-full"
                aria-label="Run on"
                data-composer-shortcut="composer.host"
                data-composer-context-control
              />
            ) : (
              <ComposerSelectControl
                size="xs"
                className="min-w-0 max-w-full"
                aria-label="Run on"
                data-composer-shortcut="composer.host"
                data-composer-context-control
              />
            )
          }
        >
          {showAutoLabel ? (
            <ScaleIcon
              className={
                displayMode === "panel" ? THREAD_DETAILS_PANEL_ICON_CLASS : "size-3 shrink-0"
              }
              aria-hidden="true"
            />
          ) : (
            <EnvironmentMachineIcon
              kind={activeEnvironment?.machine ?? "server"}
              className={
                displayMode === "panel" ? THREAD_DETAILS_PANEL_ICON_CLASS : "size-3 shrink-0"
              }
            />
          )}
          <ComposerContextLabel displayMode={displayMode}>
            {pickable || optimisticCloudSession !== null ? (
              <SelectValue />
            ) : (
              (activeEnvironment?.label ?? "Run on")
            )}
          </ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>
          {(showAutoLabel ? autoEnvironmentLabel : undefined) ??
            activeEnvironment?.label ??
            "Run on"}
        </TooltipPopup>
      </Tooltip>
      <SelectPopup
        alignItemWithTrigger={false}
        {...(displayMode === "toolbar" ? composerFloatingLayerProps : {})}
        {...(displayMode === "panel" ? { className: "w-(--anchor-width)" } : {})}
      >
        <SelectGroup>
          <SelectGroupLabel>{moveMode ? "Move to" : "Run on"}</SelectGroupLabel>
          {onAutoEnvironment && !moveMode && (
            <SelectItem
              value="auto"
              onClick={() => {
                if (autoEnvironmentLabel) onAutoEnvironment?.();
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <ScaleIcon className="size-3" aria-hidden="true" />
                {autoEnvironmentLabel ?? "Auto balance"}
              </span>
            </SelectItem>
          )}
          {pickable
            ? runOnEnvironments.map((env) => (
                <SelectItem key={env.environmentId} value={env.environmentId}>
                  <span className="inline-flex items-center gap-1.5">
                    <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                    {env.label}
                  </span>
                </SelectItem>
              ))
            : runOnEnvironments.map((env) => (
                <div
                  key={env.environmentId}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs"
                >
                  <EnvironmentMachineIcon kind={env.machine} className="size-3 shrink-0" />
                  <span className="truncate">{env.label}</span>
                </div>
              ))}
          {onCreateCloudSession && (
            <>
              {cloudRows.map((row) => (
                <RunOnCloudRow
                  key={row.session.sessionId}
                  row={row}
                  selectable={pickable}
                  selected={optimisticCloudSession?.sessionId === row.session.sessionId}
                  blockedReason={cloudMoveBlockedReason}
                  onSelect={selectCloudSession}
                  onDismiss={onDismissCloudSession}
                />
              ))}
              {/* A paid machine this thread could not move to anyway: not offered. */}
              {cloudMoveBlockedReason === null && (
                <NewCloudSessionItem
                  project={cloudSessionProject}
                  pending={cloudSessionCreatePending}
                  setupPending={cloudSessionSetupPending}
                  onCreate={createCloudSession}
                  onSetup={
                    onSetupProjectMachine
                      ? () => {
                          onSetupProjectMachine({ selectAsTarget: !moveMode });
                          setMenuOpen(false);
                          onCloudMenuOpenChange?.(false);
                        }
                      : undefined
                  }
                />
              )}
            </>
          )}
          {onSetupCloudSessions && (
            <SelectItem value={SETUP_CLOUD_SESSIONS_SELECT_VALUE}>
              <span className="inline-flex items-center gap-1.5">
                <SettingsIcon className="size-3" aria-hidden="true" />
                Set up cloud sessions
              </span>
            </SelectItem>
          )}
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
