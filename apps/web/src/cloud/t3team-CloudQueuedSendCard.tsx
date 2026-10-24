/**
 * The thread's card for a first message waiting on its cloud session: the step list (Queued →
 * Machine → Server start → Connect → Project ready → Sent) with the current step, each step's
 * elapsed time, the session's provisioning bar, and Retry/Cancel. Laid out like
 * `WorktreeSetupCard`; everything it shows comes from `t3team-cloudQueuedSendSteps`.
 */
import { CheckIcon, CircleIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { WorkLogRow } from "~/components/chat/WorkLog";
import { CloudSessionProgressBar } from "~/components/cloud/t3team-CloudSessionProgressBar";
import { formatDuration } from "~/components/cloud/t3team-cloudSessionProvisionPresentation";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { CloudProjectWaitNote } from "./t3team-CloudProjectWaitNote";
import {
  presentCloudQueuedSendProgress,
  type CloudQueuedSendStepFacts,
  type CloudQueuedSendStepView,
} from "./t3team-cloudQueuedSendSteps";

export interface CloudQueuedSendCardInput {
  readonly facts: CloudQueuedSendStepFacts;
  readonly onCancel: () => void;
  /** Null when retrying cannot help (the session ended). */
  readonly onRetry: (() => void) | null;
}

/** Ticks once a second while the send is in progress, so elapsed labels stay live. */
function useNowWhile(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return nowMs;
}

function StepIcon({ status }: { readonly status: CloudQueuedSendStepView["status"] }) {
  const className = "size-4 shrink-0 stroke-2";
  switch (status) {
    case "done":
      return <CheckIcon aria-hidden className={className} />;
    case "running":
      return <Spinner size="md" className="shrink-0" />;
    case "failed":
      return <XIcon aria-hidden className={className} />;
    case "pending":
      return <CircleIcon aria-hidden className={className} />;
  }
}

function StepRow({ step }: { readonly step: CloudQueuedSendStepView }) {
  return (
    <WorkLogRow
      data-cloud-queued-step={step.id}
      data-cloud-queued-step-status={step.status}
      icon={
        <span className={cn("text-icon-muted", step.status === "pending" && "opacity-40")}>
          <StepIcon status={step.status} />
        </span>
      }
      label={
        <span
          className={cn(
            "block truncate",
            step.status === "failed"
              ? "text-destructive-foreground"
              : step.status === "pending"
                ? "text-secondary-label opacity-40"
                : "text-secondary-label",
          )}
        >
          {step.label}
        </span>
      }
      trailing={
        <>
          {step.detail ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{step.detail}</span>
          ) : null}
          {step.elapsedSeconds !== null ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatDuration(step.elapsedSeconds)}
            </span>
          ) : null}
        </>
      }
    />
  );
}

export function CloudQueuedSendCard({ facts, onCancel, onRetry }: CloudQueuedSendCardInput) {
  const failed = facts.queued.failureMessage !== undefined;
  const nowMs = useNowWhile(!failed);
  const view = presentCloudQueuedSendProgress(facts, nowMs);
  const totalSeconds = Math.max(0, (nowMs - Date.parse(facts.queued.createdAt)) / 1000);
  return (
    <section
      aria-label="Cloud session progress"
      data-cloud-queued-current-step={view.currentStepId}
      data-cloud-queued-failed={view.failed ? "true" : "false"}
      className="mt-1"
    >
      <div className="border-b border-border/60 pt-1 pb-2">
        <div
          className={cn(
            "flex h-6 min-w-0 items-baseline gap-2 px-1 text-sm leading-relaxed tabular-nums",
            view.failed ? "text-destructive-foreground" : "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">{view.title}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {facts.queued.sessionLabel}
            {view.failed ? null : ` · ${formatDuration(totalSeconds)}`}
          </span>
        </div>
        {view.failed ? null : (
          <div className="px-1 pt-1">
            <CloudSessionProgressBar progress={view.progress} />
          </div>
        )}
      </div>
      <div className="pt-1.5">
        {view.steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </div>
      {view.projectWait === null ? null : (
        <CloudProjectWaitNote notice={view.projectWait} className="mt-1 ml-8" />
      )}
      {facts.queued.failureMessage ? (
        <p className="mt-1 ml-8 text-xs text-muted-foreground">{facts.queued.failureMessage}</p>
      ) : null}
      <div className="mt-0.5 ml-[calc(--spacing(6)+2px-(--spacing(2)-1px))] flex flex-wrap items-center gap-0.5">
        {onRetry ? (
          <Button type="button" size="xs" variant="ghost-muted" onClick={onRetry}>
            <RotateCcwIcon aria-hidden />
            Retry
          </Button>
        ) : null}
        {facts.flushing ? (
          // The turn is already starting: it is delivered, not cancellable.
          <Button type="button" size="xs" variant="ghost-muted" disabled>
            <Spinner className="size-3 shrink-0" />
            Sending…
          </Button>
        ) : (
          <Button type="button" size="xs" variant="ghost-muted" onClick={onCancel}>
            <XIcon aria-hidden />
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
