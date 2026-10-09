import { ThreadDetailsSelectControl } from "./chat/ThreadDetailsControl";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ScaleIcon, SettingsIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export interface BranchToolbarEnvironmentSelectorProps {
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
   * one-click "New cloud session". Absent hides the action item entirely.
   */
  onCreateCloudSession?: () => void;
  /**
   * New cloud session for a project with no machine: starts a session that sets one up on its own
   * thread. Absent when the flag is off, and then such a project starts a plain session.
   */
  onSetupProjectMachine?: () => void;
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
   * Connects a READY cloud session's machine (the "Ready · Connect" row). Absent
   * hides the connect affordance on those rows. Present when a provider is
   * configured; the same controller drives the Settings panel's Connect.
   */
  onCloudSessionAction?: (cloudSession: CloudSession) => void;
  /** t3team: why the last connect attempt ended without connecting; the row shows it. */
  cloudSessionConnectFailure?: { readonly sessionId: string; readonly message: string } | null;
  /** t3team: hides a surfaced failure from the menu once the user has seen it. */
  onDismissCloudSession?: (cloudSession: CloudSession) => void;
  /**
   * Drives background polling of the session list for as long as the menu is
   * open (a provisioning session changes phase every few seconds). Absent or
   * the menu closed: no polling.
   */
  onCloudMenuOpenChange?: (open: boolean) => void;
}

/** t3team: how long a clicked cloud machine gets to connect and register this thread's project. */
const CONNECT_AND_SYNC_DEADLINE_MS = 60_000;

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
  onCloudSessionAction,
  cloudSessionConnectFailure,
  onDismissCloudSession,
  onCloudMenuOpenChange,
}: BranchToolbarEnvironmentSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  // The cloud entry makes the selector interactive even with a single
  // environment, so the static-label branch is the locked state or a state
  // with neither an environment picker nor any cloud affordance.
  const hasCloudAffordance =
    onCreateCloudSession !== undefined || onSetupCloudSessions !== undefined;
  // t3team: one list — the machines, then one row per cloud session (connected or not).
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
  const activeEnvironment = useMemo(
    () =>
      [...runOnEnvironments, ...connectedCloudEnvironments].find(
        (env) => env.environmentId === environmentId,
      ) ?? null,
    [connectedCloudEnvironments, runOnEnvironments, environmentId],
  );

  // The menu's open state is controlled on purpose: the "New cloud session"
  // row is a plain button inside the popup (not a Select item), so clicking it
  // never triggers Base UI's select-and-close — the menu stays open and keeps
  // polling, and the just-created session appears in the open list.
  const [menuOpen, setMenuOpen] = useState(false);

  // Keyed by the ids, not the list: the list is rebuilt on every connection-state change.
  const projectEnvironmentKey = availableEnvironments
    .map((env) => env.environmentId)
    .join("\u0000");
  const projectEnvironmentIds = useMemo(
    () => new Set<string>(projectEnvironmentKey.split("\u0000")),
    [projectEnvironmentKey],
  );
  // Clicking a ready machine connects it, then runs the thread there: once its environment
  // registers for this project, it is selected and the menu closes. Until then the row says it
  // is connecting; a machine that connects without this project stops there, shown unavailable.
  const [selectWhenConnected, setSelectWhenConnected] = useState<string | null>(null);
  // When that wait began, so the row can show how long it has been going.
  const [connectStartedAt, setConnectStartedAt] = useState<number | null>(null);
  // Why the wait ended without connecting, on the row it belongs to, until the next attempt.
  const [connectFailure, setConnectFailure] = useState<{
    readonly sessionId: string;
    readonly message: string;
  } | null>(null);
  // The machine the user just tried that turned out not to have this project: it stays listed,
  // saying why. Other projects' machines are not listed at all — nothing here can run on them.
  const [refusedEnvironmentId, setRefusedEnvironmentId] = useState<string | null>(null);
  const cancelConnect = useCallback(() => {
    setSelectWhenConnected(null);
    setConnectStartedAt(null);
  }, []);
  // The connect itself failed (the toast says so too): stop waiting and say why on the row.
  const handledConnectFailure = useRef(cloudSessionConnectFailure);
  useEffect(() => {
    if (selectWhenConnected === null || !cloudSessionConnectFailure) return;
    // A failure acts once: a retry must not be cut short by the one it is retrying from.
    if (handledConnectFailure.current === cloudSessionConnectFailure) return;
    const waitingRow = cloudRows.find((row) => row.session.environmentId === selectWhenConnected);
    if (waitingRow?.session.sessionId !== cloudSessionConnectFailure.sessionId) return;
    handledConnectFailure.current = cloudSessionConnectFailure;
    setConnectFailure(cloudSessionConnectFailure);
    cancelConnect();
  }, [cancelConnect, cloudRows, cloudSessionConnectFailure, selectWhenConnected]);
  useEffect(() => {
    if (selectWhenConnected === null || !projectEnvironmentIds.has(selectWhenConnected)) return;
    setSelectWhenConnected(null);
    onEnvironmentChange?.(selectWhenConnected as EnvironmentId);
    setMenuOpen(false);
    onCloudMenuOpenChange?.(false);
  }, [onCloudMenuOpenChange, onEnvironmentChange, projectEnvironmentIds, selectWhenConnected]);
  // One deadline per click, read against the latest state: a fresh machine registers its project
  // seconds after it connects, so the attempt gets the whole window. Connected by then but still
  // without this project: refused, saying why. Never connected: the row is clickable again.
  const connectedRef = useRef(connectedEnvironmentIds);
  useEffect(() => {
    connectedRef.current = connectedEnvironmentIds;
  }, [connectedEnvironmentIds]);
  useEffect(() => {
    if (selectWhenConnected === null) return;
    const environment = selectWhenConnected;
    const timer = setTimeout(() => {
      if (connectedRef.current?.has(environment)) setRefusedEnvironmentId(environment);
      setSelectWhenConnected((current) => (current === environment ? null : current));
    }, CONNECT_AND_SYNC_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [selectWhenConnected]);

  const environmentItems = useMemo(
    () => [
      ...(onAutoEnvironment
        ? [{ value: "auto", label: autoEnvironmentLabel ?? "Auto balance" }]
        : []),
      ...(onEnvironmentChange !== undefined
        ? [...runOnEnvironments, ...connectedCloudEnvironments].map((env) => ({
            value: env.environmentId,
            label: env.label,
          }))
        : []),
      // "New cloud session" is deliberately NOT a keyboard-navigable item: it
      // dispatches a real VM, so it is offered as a mouse-only row below and
      // kept out of the arrow-key focus order.
      ...(onSetupCloudSessions
        ? [{ value: SETUP_CLOUD_SESSIONS_SELECT_VALUE, label: "Set up cloud sessions" }]
        : []),
    ],
    [
      runOnEnvironments,
      connectedCloudEnvironments,
      autoEnvironmentLabel,
      onAutoEnvironment,
      onEnvironmentChange,
      onSetupCloudSessions,
    ],
  );

  const handleValueChange = (value: string | null) => {
    if (value === SETUP_CLOUD_SESSIONS_SELECT_VALUE) {
      onSetupCloudSessions?.();
      return;
    }
    if (value === "auto") {
      onAutoEnvironment?.();
      return;
    }
    onEnvironmentChange?.(value as EnvironmentId);
  };

  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onCloudMenuOpenChange?.(open);
  };

  // The static label carries the xs control's height (h-7 sm:h-6) as well as
  // its padding: the composer context strip has no min-height of its own, and
  // the glass seam joining it to the composer assumes a fixed strip height, so
  // a shorter label would drag the seam out of line whenever this label is the
  // only thing in the strip.
  if (envLocked || (onEnvironmentChange === undefined && !hasCloudAffordance)) {
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
      value={autoEnvironmentLabel ? "auto" : environmentId}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      items={environmentItems}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ThreadDetailsSelectControl
              panel={displayMode === "panel"}
              className="min-w-0 max-w-full"
              aria-label="Run on"
              data-composer-shortcut="composer.host"
              data-composer-context-control
            />
          }
        >
          {autoEnvironmentLabel ? (
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
            {onEnvironmentChange !== undefined ? (
              <SelectValue />
            ) : (
              (activeEnvironment?.label ?? "Run on")
            )}
          </ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>{autoEnvironmentLabel ?? activeEnvironment?.label ?? "Run on"}</TooltipPopup>
      </Tooltip>
      <SelectPopup
        alignItemWithTrigger={false}
        {...(displayMode === "toolbar" ? composerFloatingLayerProps : {})}
        {...(displayMode === "panel"
          ? {
              className: "w-(--anchor-width)",
            }
          : {})}
      >
        <SelectGroup>
          <SelectGroupLabel>Run on</SelectGroupLabel>
          {onAutoEnvironment && (
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
          {onEnvironmentChange !== undefined
            ? runOnEnvironments.map((env) => (
                <SelectItem key={env.environmentId} value={env.environmentId}>
                  <span className="inline-flex items-center gap-1.5">
                    <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                    {env.label}
                  </span>
                </SelectItem>
              ))
            : // A single machine with a cloud entry behind it: the machine row is
              // informational (it is already the selection), not a choice.
              runOnEnvironments.map((env) => (
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
              {cloudRows
                .filter(
                  (row) =>
                    !row.unavailable ||
                    row.session.environmentId === refusedEnvironmentId ||
                    row.session.environmentId === selectWhenConnected,
                )
                .map((row) => (
                  <RunOnCloudRow
                    key={row.session.sessionId}
                    row={row}
                    selectable={onEnvironmentChange !== undefined}
                    connecting={
                      selectWhenConnected !== null &&
                      selectWhenConnected === row.session.environmentId
                    }
                    connectingSince={connectStartedAt}
                    connectError={
                      connectFailure?.sessionId === row.session.sessionId
                        ? connectFailure.message
                        : null
                    }
                    onCancelConnect={cancelConnect}
                    onConnect={(session) => {
                      setConnectFailure(null);
                      onCloudSessionAction?.(session);
                      if (session.environmentId !== undefined) {
                        setConnectStartedAt(Date.now());
                        setSelectWhenConnected(session.environmentId);
                      }
                    }}
                    onDismiss={onDismissCloudSession}
                  />
                ))}
              <NewCloudSessionItem
                project={cloudSessionProject}
                pending={cloudSessionCreatePending}
                setupPending={cloudSessionSetupPending}
                onCreate={() => onCreateCloudSession?.()}
                onSetup={onSetupProjectMachine}
              />
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
