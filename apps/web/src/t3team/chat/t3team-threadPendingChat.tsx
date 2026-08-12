import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadBootstrapStall } from "~/t3team/chat/t3team-useThreadBootstrapStall";

type ThreadPendingChatProps = {
  bootstrapStatus?: ThreadBootstrapStatus;
  threadId?: string;
  onRetryLaunch?: () => void;
};

/**
 * The pre-live state of a thread that exists locally but not yet on the server.
 *
 * Three outcomes, never a fourth: working, stalled, failed. It used to be possible to sit here
 * forever on "Creating thread…" with the retry button DISABLED — the button is disabled while the
 * bootstrap is "running", and a bootstrap that hangs is "running" for good. That made a broken
 * launch look exactly like a slow one, with nothing in the console or the server log to tell them
 * apart. The stall watchdog closes that hole.
 */
export function ThreadPendingChat({
  bootstrapStatus = "running",
  threadId = "",
  onRetryLaunch,
}: ThreadPendingChatProps) {
  const isFailed = bootstrapStatus === "failed";
  const stalled = useThreadBootstrapStall({ pending: !isFailed, threadId });
  const isStuck = isFailed || stalled;

  return (
    <div className="flex min-h-[18rem] flex-1 items-center justify-center px-6 py-10">
      <div className="flex max-w-md flex-col items-center text-center">
        {isStuck ? (
          <AlertCircleIcon className="size-5 text-destructive" />
        ) : (
          <LoaderCircleIcon className="size-5 animate-spin text-primary" />
        )}
        <p className="mt-3 text-sm font-medium text-foreground">
          {isFailed ? "Launch interrupted" : stalled ? "This didn't start" : "Creating thread..."}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isFailed
            ? "The live conversation never picked up the local kickoff state. Retry the launch to recreate the durable thread state."
            : stalled
              ? "Something went wrong before anything was sent — no model was called and nothing ran. Retrying is safe."
              : "Waiting for the live conversation to pick up the local kickoff state."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => onRetryLaunch?.()}
          disabled={!onRetryLaunch || !isStuck}
        >
          Retry launch
        </Button>
      </div>
    </div>
  );
}
