import type { CloudSession, EnvironmentId } from "@t3tools/contracts";
import { CloudIcon, ScaleIcon } from "lucide-react";
import { memo, useMemo } from "react";

import type { EnvironmentOption } from "./BranchToolbar.logic";
import { EnvironmentMachineIcon } from "./EnvironmentMachineIcon";
import { composerFloatingLayerProps } from "./chat/composerEventScope";
import { presentCloudSession } from "./cloud/cloudSessionProvisionPresentation";
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
  /** Absent hides the action item entirely, leaving the menu exactly as it was. */
  onCreateCloudSession?: () => void;
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
}: BranchToolbarEnvironmentSelectorProps) {
  const activeEnvironment = useMemo(() => {
    return availableEnvironments.find((env) => env.environmentId === environmentId) ?? null;
  }, [availableEnvironments, environmentId]);

  const environmentItems = useMemo(
    () => [
      ...(onAutoEnvironment
        ? [{ value: "auto", label: autoEnvironmentLabel ?? "Auto balance" }]
        : []),
      ...availableEnvironments.map((env) => ({
        value: env.environmentId,
        label: env.label,
      })),
      ...(onCreateCloudSession
        ? [{ value: CREATE_CLOUD_SESSION_SELECT_VALUE, label: "New cloud session" }]
        : []),
    ],
    [availableEnvironments, autoEnvironmentLabel, onAutoEnvironment, onCreateCloudSession],
  );

  // The static label carries the xs control's height (h-7 sm:h-6) as well as
  // its padding: the composer context strip has no min-height of its own, and
  // the glass seam joining it to the composer assumes a fixed strip height, so
  // a shorter label would drag the seam out of line whenever this label is the
  // only thing in the strip.
  if (envLocked || onEnvironmentChange === undefined) {
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
      onValueChange={(value) => {
        if (value === CREATE_CLOUD_SESSION_SELECT_VALUE) {
          onCreateCloudSession?.();
          return;
        }
        if (value === "auto") {
          onAutoEnvironment?.();
          return;
        }
        onEnvironmentChange(value as EnvironmentId);
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
            <SelectValue />
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
          {availableEnvironments.map((env) => (
            <SelectItem key={env.environmentId} value={env.environmentId}>
              <span className="inline-flex items-center gap-1.5">
                <EnvironmentMachineIcon kind={env.machine} className="size-3" />
                {env.label}
              </span>
            </SelectItem>
          ))}
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
      </SelectPopup>
    </Select>
  );
});
