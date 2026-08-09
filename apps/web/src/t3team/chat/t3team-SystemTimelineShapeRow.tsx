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
import { useMergedThreads } from "~/t3team/t3team-mergedThreads";

export function T3TeamSystemTimelineShapeRow({
  workflowShape,
  threadRef,
  workflowStepRuns,
  workflowRunStatus,
  onControlWorkflow,
  onOpenThread,
}: {
  readonly workflowShape: NonNullable<ReturnType<typeof getT3TeamWorkflowShapeAttachment>>;
  readonly threadRef: ScopedThreadRef | null;
  readonly workflowStepRuns?: ReadonlyMap<string, T3TeamWorkflowRunProgress>;
  readonly workflowRunStatus?: OrchestrationWorkflowRunStatus;
  readonly onControlWorkflow?: ChatViewT3TeamExtensionProps["onControlWorkflow"];
  readonly onOpenThread?: ChatViewT3TeamExtensionProps["onOpenThread"];
}) {
  const mergedThreads = useMergedThreads();
  const childStatuses = Object.fromEntries(
    mergedThreads.flatMap((thread) =>
      thread.childStatus ? [[thread.id, thread.childStatus] as const] : [],
    ),
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
        />
      ) : (
        <T3TeamWorkflowShapeCard shape={workflowShape} />
      )}
    </div>
  );
}
