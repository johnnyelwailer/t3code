import { EnvironmentId } from "@t3tools/contracts";
import { EraserIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type CloudEnvironmentExitActionsProps = {
  environmentId: EnvironmentId;
  isConnected: boolean;
  isConnecting: boolean;
  isRemoving: boolean;
  /** The machine is a live cloud session: the row is a read-only connect target. */
  isCloudSession: boolean;
  onConnect: (environmentId: EnvironmentId) => void;
  onRemove: (environmentId: EnvironmentId) => void;
};

/**
 * The actions for a saved cloud (T3 Connect) machine, kept apart from the plain
 * switch/menu that other backends use.
 *
 * A machine that is a live cloud session is a read-only connect target here:
 * Connect plus a "Cloud session" chip. Its lifecycle — stop, forget — lives in
 * the cloud session panel, so the same machine never carries two competing
 * action sets. Any other T3 Connect machine keeps "Forget this environment",
 * which removes the local saved-connection record and deliberately does NOT
 * stop the remote machine.
 */
export function CloudEnvironmentExitActions({
  environmentId,
  isConnected,
  isConnecting,
  isRemoving,
  isCloudSession,
  onConnect,
  onRemove,
}: CloudEnvironmentExitActionsProps) {
  return (
    <div className="flex items-center gap-1.5">
      {isCloudSession ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              />
            }
          >
            Cloud session
          </TooltipTrigger>
          <TooltipPopup side="top">Stop or forget it under Cloud sessions</TooltipPopup>
        </Tooltip>
      ) : null}
      {!isConnected ? (
        <Button
          size="xs"
          variant="outline"
          disabled={isConnecting || isRemoving}
          onClick={() => onConnect(environmentId)}
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </Button>
      ) : null}
      {isCloudSession ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="outline"
                aria-label="Forget this environment"
                disabled={isRemoving}
                onClick={() => onRemove(environmentId)}
              >
                <EraserIcon className="size-4" />
              </Button>
            }
          />
          <TooltipPopup side="top">
            Forget this environment — the machine keeps running
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
