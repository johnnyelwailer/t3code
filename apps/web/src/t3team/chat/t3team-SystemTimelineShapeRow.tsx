/**
 * The timeline row for a message carrying a workflow shape.
 *
 * Sibling of `T3TeamSystemTimelineDecisionRow`: the second of the three mutually exclusive shapes
 * `T3TeamSystemTimelineRow` can take. It resolves its own live progress and child statuses, so the
 * parent no longer has to derive either for a branch it may never render.
 */
import type { OrchestrationWorkflowRunStatus, ScopedThreadRef } from "@t3tools/contracts";

import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import {
  getT3TeamWorkflowShapeAttachment,
  T3TeamWorkflowShapeCard,
} from "~/t3team/chat/t3team-messageShapeCard";
import { T3TeamWorkflowShapeLiveCard } from "~/t3team/chat/t3team-messageShapeCardLive";
import type { T3TeamWorkflowRunProgress } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { useMemo } from "react";

import { useT3TeamThreadFactsMap } from "~/state/t3team-threadSideStreams";

export function T3TeamSystemTimelineShapeRow({
  workflowShape,
  threadRef,
  workflowStepRuns,
  workflowRunStatus,
  onControlWorkflow,
  onOpenThread,
  outcomeSummary,
}: {
  readonly workflowShape: NonNullable<ReturnType<typeof getT3TeamWorkflowShapeAttachment>>;
  readonly threadRef: ScopedThreadRef | null;
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: OrchestrationWorkflowRunStatus;
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
  /** A short, honest outcome line for the run's banner (never the full result) — see
   * `t3team-workflowRunOutcome.ts`. Only meaningful once the run has a live progress card. */
  readonly outcomeSummary?: string | undefined;
}) {
  // Child status is a fork thread fact of each child (step rows link to those threads).
  const facts = useT3TeamThreadFactsMap(threadRef?.environmentId ?? null);
  const childStatuses = useMemo(
    () =>
      Object.fromEntries(
        [...facts.values()].flatMap((entry) =>
          entry.childStatus ? [[entry.threadId, entry.childStatus] as const] : [],
        ),
      ),
    [facts],
  );
  const progress =
    workflowShape.workflowRunId !== undefined
      ? (workflowStepRuns?.get(workflowShape.workflowRunId) ?? null)
      : null;

  return (
    <div className="max-w-[92%]">
      {progress ? (
        <T3TeamWorkflowShapeLiveCard
          shape={workflowShape}
          progress={progress}
          {...(workflowRunStatus?.runId === workflowShape.workflowRunId
            ? { workflowRunStatus }
            : {})}
          {...(onControlWorkflow ? { onControlWorkflow } : {})}
          {...(onOpenThread ? { onOpenThread } : {})}
          {...(threadRef ? { currentThreadId: threadRef.threadId } : {})}
          childStatuses={childStatuses}
          {...(outcomeSummary ? { outcomeSummary } : {})}
        />
      ) : (
        <T3TeamWorkflowShapeCard shape={workflowShape} />
      )}
    </div>
  );
}
