import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import type { InChatLaunchPhase } from "~/t3team/chat/t3team-inChatLaunchStatus";
import type { ThreadBootstrapStatus } from "~/t3team/chat/t3team-useThreadBootstrap";
import { useThreadBootstrapStall } from "~/t3team/chat/t3team-useThreadBootstrapStall";

type ThreadPendingChatProps = {
  bootstrapStatus?: ThreadBootstrapStatus;
  threadId?: string;
  onRetryLaunch?: () => void;
  phase?: InChatLaunchPhase | null;
  /** Sits inside the open chat instead of replacing the whole panel. */
  compact?: boolean;
};

function runningTitle(phase: InChatLaunchPhase | null | undefined): string {
  return phase === "preparing" ? "Starting the run..." : "Creating thread...";
}

function runningDetail(phase: InChatLaunchPhase | null | undefined): string {
  return phase === "preparing"
    ? "Preparing context and starting the run."
    : "Creating the conversation on the server.";
}

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
  phase = null,
  compact = false,
}: ThreadPendingChatProps) {
  const isFailed = bootstrapStatus === "failed";
  const stalled = useThreadBootstrapStall({ pending: !isFailed, threadId });
  const isStuck = isFailed || stalled;

  return (
    <div
      className={
        compact
          ? "flex shrink-0 items-start gap-3 border-b border-border/60 px-4 py-3"
          : "flex min-h-[12rem] flex-1 items-center justify-center px-6 py-6"
      }
    >
      <div
        className={
          compact
            ? "flex min-w-0 flex-1 flex-col"
            : "flex max-w-md flex-col items-center text-center"
        }
      >
        {isStuck ? (
          <AlertCircleIcon className="size-5 text-destructive" />
        ) : (
          <LoaderCircleIcon className="size-5 animate-spin text-primary" />
        )}
        <p className="mt-3 text-sm font-medium text-foreground">
          {isFailed ? "Launch interrupted" : stalled ? "This didn't start" : runningTitle(phase)}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isFailed
            ? "The kickoff didn't reach the run. Retry the launch to send it again — the conversation is kept."
            : stalled
              ? "Something went wrong before anything was sent — no model was called and nothing ran. Retrying is safe."
              : runningDetail(phase)}
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
