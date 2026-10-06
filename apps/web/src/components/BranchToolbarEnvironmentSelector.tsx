import { ThreadDetailsSelectControl } from "./chat/ThreadDetailsControl";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./ui/tooltip";
import type { CloudSession, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { CloudIcon, ScaleIcon, SettingsIcon, XIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import type { EnvironmentOption } from "./BranchToolbar.logic";
import { dedupeRunOnEnvironments } from "./BranchToolbar.logic";
import { cn } from "../lib/utils";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS,
} from "./chat/threadDetailsPanelStyles";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { presentCloudSession } from "./cloud/t3team-cloudSessionProvisionPresentation";
import { CloudSessionMachineHint } from "./cloud/t3team-CloudSessionMachineHint";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectSeparator,
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
   * visible where you pick a machine) and the most recent failed one, with
   * its failure reason. A ready session is deliberately absent: it has joined
   * `availableEnvironments` by then and listing it twice would be a lie about
   * how many machines exist.
   */
  pendingCloudSessions?: readonly CloudSession[];
  /**
   * Present when the server has a cloud provider configured: the menu offers a
   * one-click "New cloud session". Absent hides the action item entirely.
   */
  onCreateCloudSession?: () => void;
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
  /** t3team: hides a surfaced failure from the menu once the user has seen it. */
  onDismissCloudSession?: (cloudSession: CloudSession) => void;
  /**
   * Drives background polling of the session list for as long as the menu is
   * open (a provisioning session changes phase every few seconds). Absent or
   * the menu closed: no polling.
   */
  onCloudMenuOpenChange?: (open: boolean) => void;
}

export const BranchToolbarEnvironmentSelector = memo(function BranchToolbarEnvironmentSelector({
  autoEnvironmentLabel,
  onAutoEnvironment,
  envLocked,
  environmentId,
  availableEnvironments,
  onEnvironmentChange,
  displayMode = "toolbar",
  pendingCloudSessions,
  onCreateCloudSession,
  cloudSessionProject,
  onSetupCloudSessions,
  onCloudSessionAction,
  onDismissCloudSession,
  onCloudMenuOpenChange,
}: BranchToolbarEnvironmentSelectorProps) {
  const composerFloatingLayerProps = useComposerMenuProps();
  // The cloud entry makes the selector interactive even with a single
  // environment, so the static-label branch is the locked state or a state
  // with neither an environment picker nor any cloud affordance.
  const hasCloudAffordance =
    onCreateCloudSession !== undefined || onSetupCloudSessions !== undefined;
  const runOnEnvironments = useMemo(
    () => dedupeRunOnEnvironments(availableEnvironments, environmentId),
    [availableEnvironments, environmentId],
  );
  const activeEnvironment = useMemo(
    () => runOnEnvironments.find((env) => env.environmentId === environmentId) ?? null,
    [runOnEnvironments, environmentId],
  );

  // The menu's open state is controlled on purpose: the "New cloud session"
  // row is a plain button inside the popup (not a Select item), so clicking it
  // never triggers Base UI's select-and-close — the menu stays open and keeps
  // polling, and the just-created session appears in the open list.
  const [menuOpen, setMenuOpen] = useState(false);

  const environmentItems = useMemo(
    () => [
      ...(onAutoEnvironment
        ? [{ value: "auto", label: autoEnvironmentLabel ?? "Auto balance" }]
        : []),
      ...(onEnvironmentChange !== undefined
        ? runOnEnvironments.map((env) => ({
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
        </SelectGroup>
        {onCreateCloudSession && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectGroupLabel>Cloud</SelectGroupLabel>
              {pendingCloudSessions?.map((cloudSession) => {
                const presentation = presentCloudSession(cloudSession);
                const isReady = cloudSession.phase === "ready";
                const rowClasses =
                  "flex w-full items-start gap-1.5 px-2 py-1.5 text-muted-foreground text-xs";
                // A ready machine is a real connectable row (it must not vanish
                // the moment it comes up). A still-provisioning one is
                // read-only: it cannot run anything yet, and a disabled item
                // would still read as a choice.
                return isReady ? (
                  <button
                    key={cloudSession.sessionId}
                    type="button"
                    onClick={() => onCloudSessionAction?.(cloudSession)}
                    className={cn(rowClasses, "cursor-pointer text-foreground hover:bg-muted/40")}
                  >
                    <EnvironmentMachineIcon kind="cloud" className="mt-0.5 size-3 shrink-0" />
                    <CloudRowText title={presentation.title} detail={presentation.detail} />
                  </button>
                ) : (
                  <div key={cloudSession.sessionId} className={rowClasses}>
                    <EnvironmentMachineIcon
                      kind="cloud"
                      className={cn(
                        "mt-0.5 size-3 shrink-0",
                        presentation.tone === "working" && "animate-pulse",
                      )}
                    />
                    <CloudRowText title={presentation.title} detail={presentation.detail} />
                    {cloudSession.phase === "failed" && onDismissCloudSession ? (
                      <button
                        type="button"
                        aria-label="Dismiss"
                        title="Dismiss"
                        onClick={() => onDismissCloudSession(cloudSession)}
                        className="-mr-1 shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        <XIcon className="size-3" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {/* Mouse-only on purpose: dispatching a VM is a real cost, so this
                  row is outside the arrow-key focus order (finding: one Enter
                  must not provision a machine). */}
              <button
                type="button"
                onClick={() => onCreateCloudSession?.()}
                className="flex w-full cursor-pointer items-start gap-1.5 rounded-sm px-2 py-1.5 text-foreground hover:bg-muted/40 sm:text-sm"
              >
                <CloudIcon className="mt-0.5 size-3 shrink-0 self-start" aria-hidden="true" />
                <span className="flex min-w-0 flex-col items-start text-left">
                  <span>New cloud session</span>
                  {cloudSessionProject ? (
                    <span className="max-w-full truncate text-muted-foreground text-xs">
                      <CloudSessionMachineHint {...cloudSessionProject} />
                    </span>
                  ) : null}
                </span>
              </button>
            </SelectGroup>
          </>
        )}
        {onSetupCloudSessions && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectGroupLabel>Cloud</SelectGroupLabel>
              <SelectItem value={SETUP_CLOUD_SESSIONS_SELECT_VALUE}>
                <span className="inline-flex items-center gap-1.5">
                  <SettingsIcon className="size-3" aria-hidden="true" />
                  Set up cloud sessions
                </span>
              </SelectItem>
            </SelectGroup>
          </>
        )}
      </SelectPopup>
    </Select>
  );
});

/** A cloud row's title over its detail, so a narrow menu truncates the detail, never the title. */
function CloudRowText({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start text-left">
      <span className="max-w-full truncate">{title}</span>
      <span className="max-w-full truncate opacity-70">{detail}</span>
    </span>
  );
}
