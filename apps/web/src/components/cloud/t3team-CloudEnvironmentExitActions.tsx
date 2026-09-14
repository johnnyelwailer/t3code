import { EnvironmentId } from "@t3tools/contracts";
import { EraserIcon, PowerIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

type CloudEnvironmentExitActionsProps = {
  environmentId: EnvironmentId;
  isConnected: boolean;
  isConnecting: boolean;
  isRemoving: boolean;
  canStopCloudSession: boolean;
  isStoppingCloudSession: boolean;
  onConnect: (environmentId: EnvironmentId) => void;
  onRemove: (environmentId: EnvironmentId) => void;
  onStopCloudSession: (environmentId: EnvironmentId) => void;
};

/**
 * The exit verbs for a connected cloud (T3 Connect) machine, kept as a distinct
 * cluster from the plain Connect/Disconnect/Remove that other backends use.
 *
 * "Stop this machine" ends the live cloud session on the server. "Forget this
 * environment" removes the local saved-connection record and deliberately does
 * NOT stop the remote machine. The two verbs stay separate so a user never
 * mistakes "drop my local record" for "kill the machine."
 */
export function CloudEnvironmentExitActions({
  environmentId,
  isConnected,
  isConnecting,
  isRemoving,
  canStopCloudSession,
  isStoppingCloudSession,
  onConnect,
  onRemove,
  onStopCloudSession,
}: CloudEnvironmentExitActionsProps) {
  const busy = isRemoving || isStoppingCloudSession;
  return (
    <div className="flex items-center gap-1.5">
      {!isConnected ? (
        <Button
          size="xs"
          variant="outline"
          disabled={isConnecting || busy}
          onClick={() => onConnect(environmentId)}
        >
          {isConnecting ? "Connecting…" : "Connect"}
        </Button>
      ) : null}
      {canStopCloudSession ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="outline"
                aria-label="Stop this machine"
                disabled={busy}
                onClick={() => onStopCloudSession(environmentId)}
              >
                <PowerIcon className="size-4" />
              </Button>
            }
          />
          <TooltipPopup side="top">
            {isStoppingCloudSession ? "Stopping this machine…" : "Stop this machine"}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="outline"
              aria-label="Forget this environment"
              disabled={busy}
              onClick={() => onRemove(environmentId)}
            >
              <EraserIcon className="size-4" />
            </Button>
          }
        />
        <TooltipPopup side="top">Forget this environment — the machine keeps running</TooltipPopup>
      </Tooltip>
    </div>
  );
}
