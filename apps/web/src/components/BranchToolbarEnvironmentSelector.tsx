import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { CloudIcon, ScaleIcon, SettingsIcon } from "lucide-react";
import { memo, useMemo } from "react";

import type { EnvironmentOption } from "./BranchToolbar.logic";
import { dedupeRunOnEnvironments } from "./BranchToolbar.logic";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { composerFloatingLayerProps } from "./chat/composerEventScope";
import { presentCloudSession } from "./cloud/t3team-cloudSessionProvisionPresentation";
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
 * Sentinel value for the "start a cloud session" action item, in the same shape
 * as the existing `"auto"` item: selecting it runs a callback and leaves the
 * chosen environment alone, rather than becoming the selection itself.
 */
const CREATE_CLOUD_SESSION_SELECT_VALUE = "__create-cloud-session__";

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
   * Cloud sessions that have not finished provisioning yet, shown read-only so
   * the machine you just asked for is visible where you pick a machine. A ready
   * session is deliberately absent: it has joined `availableEnvironments` by
   * then and listing it twice would be a lie about how many machines exist.
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
  onCloudMenuOpenChange,
}: BranchToolbarEnvironmentSelectorProps) {
  // The cloud entry makes the selector interactive even with a single
  // environment, so the static-label branch is the locked state or a state
  // with neither an environment picker nor any cloud affordance.
  const hasCloudAffordance = onCreateCloudSession !== undefined || onSetupCloudSessions !== undefined;
  const runOnEnvironments = useMemo(
    () => dedupeRunOnEnvironments(availableEnvironments, environmentId),
    [availableEnvironments, environmentId],
  );
  const activeEnvironment = useMemo(
    () => runOnEnvironments.find((env) => env.environmentId === environmentId) ?? null,
    [runOnEnvironments, environmentId],
  );

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
      ...(onCreateCloudSession
        ? [{ value: CREATE_CLOUD_SESSION_SELECT_VALUE, label: "New cloud session" }]
        : []),
      ...(onSetupCloudSessions
        ? [{ value: SETUP_CLOUD_SESSIONS_SELECT_VALUE, label: "Set up cloud sessions" }]
        : []),
    ],
    [
      runOnEnvironments,
      autoEnvironmentLabel,
      onAutoEnvironment,
      onEnvironmentChange,
      onCreateCloudSession,
      onSetupCloudSessions,
    ],
  );

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
      value={autoEnvironmentLabel ? "auto" : environmentId}
      onOpenChange={(open) => onCloudMenuOpenChange?.(open)}
      onValueChange={(value) => {
        if (value === CREATE_CLOUD_SESSION_SELECT_VALUE) {
          onCreateCloudSession?.();
          return;
        }
        if (value === SETUP_CLOUD_SESSIONS_SELECT_VALUE) {
          onSetupCloudSessions?.();
          return;
        }
        if (value === "auto") {
          onAutoEnvironment?.();
          return;
        }
        onEnvironmentChange?.(value as EnvironmentId);
      }}
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
              activeEnvironment?.label ?? "Run on"
            )}
          </span>
        </span>
      </SelectTrigger>
      <SelectPopup alignItemWithTrigger={false} {...composerFloatingLayerProps}>
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
          {onEnvironmentChange !== undefined ? (
            runOnEnvironments.map((env) => (
              <SelectItem key={env.environmentId} value={env.environmentId}>
                <span className="inline-flex items-center gap-1.5">
                  <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                  {env.label}
                </span>
              </SelectItem>
            ))
          ) : (
            // A single machine with a cloud entry behind it: the machine row is
            // informational (it is already the selection), not a choice.
            runOnEnvironments.map((env) => (
              <div
                key={env.environmentId}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs"
              >
                <EnvironmentMachineIcon kind={env.machine} className="size-3 shrink-0" />
                <span className="truncate">{env.label}</span>
              </div>
            ))
          )}
        </SelectGroup>
        {onCreateCloudSession && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectGroupLabel>Cloud</SelectGroupLabel>
              {pendingCloudSessions?.map((cloudSession) => {
                const presentation = presentCloudSession(cloudSession);
                return (
                  // Not a SelectItem: a machine that cannot run anything yet must
                  // not be selectable, and a disabled item still reads as a choice.
                  <div
                    key={cloudSession.sessionId}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground text-xs"
                  >
                    <EnvironmentMachineIcon
                      kind="cloud"
                      className="size-3 shrink-0 animate-pulse"
                    />
                    <span className="truncate">{presentation.title}</span>
                    <span className="truncate opacity-70">{presentation.detail}</span>
                  </div>
                );
              })}
              <SelectItem value={CREATE_CLOUD_SESSION_SELECT_VALUE}>
                <span className="inline-flex items-center gap-1.5">
                  <CloudIcon className="size-3" aria-hidden="true" />
                  New cloud session
                </span>
              </SelectItem>
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
