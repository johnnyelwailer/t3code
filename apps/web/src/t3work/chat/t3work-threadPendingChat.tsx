import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "~/t3work/components/ui/t3work-button";
import type { ThreadBootstrapStatus } from "~/t3work/chat/t3work-useThreadBootstrap";

type ThreadPendingChatProps = {
  bootstrapStatus?: ThreadBootstrapStatus;
  onRetryLaunch?: () => void;
};

export function ThreadPendingChat({
  bootstrapStatus = "running",
  onRetryLaunch,
}: ThreadPendingChatProps) {
  const isFailed = bootstrapStatus === "failed";

  return (
    <div className="flex min-h-[18rem] flex-1 items-center justify-center px-6 py-10">
      <div className="flex max-w-md flex-col items-center text-center">
        {isFailed ? (
          <AlertCircleIcon className="size-5 text-amber-600" />
        ) : (
          <LoaderCircleIcon className="size-5 animate-spin text-primary" />
        )}
        <p className="mt-3 text-sm font-medium text-foreground">
          {isFailed ? "Launch interrupted" : "Creating thread..."}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isFailed
            ? "The live conversation never picked up the local kickoff state. Retry the launch to recreate the durable thread state."
            : "Waiting for the live conversation to pick up the local kickoff state."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => onRetryLaunch?.()}
          disabled={!onRetryLaunch || bootstrapStatus === "running"}
        >
          Retry launch
        </Button>
      </div>
    </div>
  );
}
