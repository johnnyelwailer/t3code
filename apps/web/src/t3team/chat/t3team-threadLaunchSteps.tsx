import { AlertCircleIcon, CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";

import { Button } from "~/t3team/components/ui/t3team-button";
import {
  selectThreadLaunchSteps,
  type ThreadBootstrapProgress,
  type ThreadLaunchStepPresentation,
} from "~/t3team/chat/t3team-threadBootstrapProgress";

export type { ThreadLaunchStepPresentation };

/** One preparation step as it appears inline in the thread while it works. */
export function ThreadLaunchStepRow({ label, status }: ThreadLaunchStepPresentation) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {status === "done" ? (
        <CheckCircle2Icon className="size-4 shrink-0 text-success-foreground" />
      ) : status === "busy" ? (
        <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-primary" />
      ) : status === "error" ? (
        <AlertCircleIcon className="size-4 shrink-0 text-destructive" />
      ) : (
        <div className="size-4 shrink-0 rounded-full border border-border/70" />
      )}
      <span>{label}</span>
    </div>
  );
}

/**
 * The bootstrap's per-step progress, inline in the thread. Before the first report arrives the
 * "create" step is busy: the bootstrap has claimed the dispatch, so something is in flight.
 */
export function ThreadLaunchStepList({ progress }: { progress: ThreadBootstrapProgress | null }) {
  return (
    <div className="space-y-2">
      {selectThreadLaunchSteps(progress).map((step) => (
        <ThreadLaunchStepRow key={step.label} {...step} />
      ))}
    </div>
  );
}

/** The kickoff's first message, shown the moment the thread opens — before any server round-trip. */
export function ThreadKickoffFirstMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-end">
      <p className="me-1 text-2xs text-muted-foreground/70">You</p>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-message p-3 text-sm leading-6 text-message-foreground">
        {text}
      </div>
    </div>
  );
}

/** An inline failure with a retry: the conversation (and its input) is kept. */
export function ThreadLaunchFailure({
  title,
  detail,
  retryLabel,
  onRetry,
}: {
  title: string;
  detail: string;
  retryLabel: string;
  onRetry: (() => void) | undefined;
}) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onRetry?.()}
            disabled={!onRetry}
          >
            {retryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
