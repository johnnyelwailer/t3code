import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { T3workWorkflowStepEntry } from "~/t3work/chat/t3work-threadWorkflowStepProgress";

const STEP_ROW_SHELL_CLASS_NAME = "rounded-md px-1 py-0.5";

export function T3workWorkflowStepDetails(props: {
  readonly step: T3workWorkflowStepEntry | undefined;
  readonly hideDetail?: boolean;
  /** Repair internals can contain prompts, runtime ids, or provider/model names. */
  readonly redactDetail?: boolean;
  readonly children: ReactNode;
  readonly onOpenThread?: (input: { projectId: string; threadId: string }) => void;
}) {
  const { step, children, hideDetail, redactDetail, onOpenThread } = props;
  if (!step) {
    return (
      <div className={STEP_ROW_SHELL_CLASS_NAME} data-step-row-shell="static">
        {children}
      </div>
    );
  }

  const canOpenThread = Boolean(step.projectId && step.threadId && onOpenThread);
  // `thread.turn`, `thread.create`, and similar values are journal implementation
  // details. They must never become a visible "work log" just because an agent
  // step has no authored detail.
  const detail = redactDetail
    ? "Final error"
    : hideDetail
      ? step.error
      : (step.detail ?? step.error);
  const hasDetail = Boolean(detail?.trim());

  const openThread = canOpenThread ? (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenThread?.({ projectId: step.projectId!, threadId: step.threadId! });
      }}
    >
      Open thread
      <ExternalLinkIcon className="size-3" />
    </button>
  ) : null;

  if (!hasDetail) {
    return (
      <div className={STEP_ROW_SHELL_CLASS_NAME} data-step-row-shell="static">
        {children}
        {openThread ? <div className="ml-7 mt-0.5">{openThread}</div> : null}
      </div>
    );
  }

  return (
    <details className="group/step rounded-md open:bg-muted/25">
      <summary
        className={`${STEP_ROW_SHELL_CLASS_NAME} cursor-pointer list-none hover:bg-muted/35 [&::-webkit-details-marker]:hidden`}
        data-step-row-shell="interactive"
      >
        {children}
      </summary>
      <div className="mx-7 mb-1.5 mt-1 border-l border-border/60 pl-3 text-xs text-muted-foreground">
        <p className="whitespace-pre-wrap leading-5">{detail}</p>
        {step.error && step.detail && !redactDetail && step.error !== detail ? (
          <p className="mt-1 text-destructive">{step.error}</p>
        ) : null}
        {openThread ? <div className="mt-1.5">{openThread}</div> : null}
      </div>
    </details>
  );
}
