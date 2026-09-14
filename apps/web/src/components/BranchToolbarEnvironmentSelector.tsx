import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { CloudIcon, ScaleIcon, SettingsIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import type { EnvironmentOption } from "./BranchToolbar.logic";
import { dedupeRunOnEnvironments } from "./BranchToolbar.logic";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { composerFloatingLayerProps } from "./chat/composerEventScope";
import { presentCloudSession } from "./cloud/t3team-cloudSessionProvisionPresentation";
import { cn } from "~/lib/utils";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
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
  // Absent when there is only one environment to show: the indicator still
  // renders (as a static label) so remote projects are always identifiable.
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
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
  pendingCloudSessions,
  onCreateCloudSession,
  onSetupCloudSessions,
  onCloudSessionAction,
  onCloudMenuOpenChange,
}: BranchToolbarEnvironmentSelectorProps) {
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

  if (envLocked || (onEnvironmentChange === undefined && !hasCloudAffordance)) {
    return (
      <span
        className="inline-flex h-7 min-w-0 max-w-full items-center gap-1 border border-transparent px-[calc(--spacing(2)-1px)] font-normal text-muted-foreground/70 text-xs sm:h-6"
        data-composer-context-control
      >
        <EnvironmentMachineIcon
          kind={activeEnvironment?.machine ?? "server"}
          className="size-3 shrink-0"
        />
        <span
          data-composer-label
          className="min-w-0 max-w-[240px] group-data-[compact]/composer-context:max-w-0"
        >
          <span
            data-composer-label-motion
            className="block w-full min-w-0 max-w-[240px] origin-left truncate transition-[opacity,transform] duration-180 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[compact]/composer-context:[transform:translateX(-0.25rem)_scaleX(0.95)] group-data-[compact]/composer-context:opacity-0 motion-reduce:transform-none motion-reduce:transition-opacity"
          >
            {activeEnvironment?.label ?? "Run on"}
          </span>
        </span>
      </span>
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
      <SelectTrigger
        variant="ghost"
        size="xs"
        className="min-w-0 max-w-full font-normal text-xs!"
        aria-label="Run on"
        data-composer-context-control
      >
        {autoEnvironmentLabel ? (
          <ScaleIcon className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <EnvironmentMachineIcon
            kind={activeEnvironment?.machine ?? "server"}
            className="size-3 shrink-0"
          />
        )}
        <span
          data-composer-label
          className="min-w-0 max-w-[240px] group-data-[compact]/composer-context:max-w-0"
        >
          <span
            data-composer-label-motion
            className="block w-full min-w-0 max-w-[240px] origin-left truncate transition-[opacity,transform] duration-180 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[compact]/composer-context:[transform:translateX(-0.25rem)_scaleX(0.95)] group-data-[compact]/composer-context:opacity-0 motion-reduce:transform-none motion-reduce:transition-opacity"
          >
            {onEnvironmentChange !== undefined ? (
              <SelectValue />
            ) : (
              (activeEnvironment?.label ?? "Run on")
            )}
          </span>
        </span>
      </SelectTrigger>
      <SelectPopup
        alignItemWithTrigger={false}
        popupClassName="min-w-40"
        {...composerFloatingLayerProps}
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
                  "flex w-full items-center gap-1.5 px-2 py-1.5 text-muted-foreground text-xs";
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
                    <EnvironmentMachineIcon kind="cloud" className="size-3 shrink-0" />
                    <span className="shrink-0">{presentation.title}</span>
                    <span className="min-w-0 flex-1 truncate opacity-70">
                      {presentation.detail}
                    </span>
                  </button>
                ) : (
                  <div key={cloudSession.sessionId} className={rowClasses}>
                    <EnvironmentMachineIcon
                      kind="cloud"
                      className={cn(
                        "size-3 shrink-0",
                        presentation.tone === "working" && "animate-pulse",
                      )}
                    />
                    <span className="shrink-0">{presentation.title}</span>
                    <span className="min-w-0 flex-1 truncate opacity-70">
                      {presentation.detail}
                    </span>
                  </div>
                );
              })}
              {/* Mouse-only on purpose: dispatching a VM is a real cost, so this
                  row is outside the arrow-key focus order (finding: one Enter
                  must not provision a machine). */}
              <button
                type="button"
                onClick={() => onCreateCloudSession?.()}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-foreground hover:bg-muted/40 sm:text-sm"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CloudIcon className="size-3" aria-hidden="true" />
                  New cloud session
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
