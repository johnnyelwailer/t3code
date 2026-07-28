/**
 * The rows a live workflow-run card is built from: one runtime step, the run banner, and the
 * self-heal strip.
 *
 * Split out of `t3team-messageShapeCardLive` to bring that file back under the 200-line cap, and because
 * this is where the ONE navigation rule for a step row lives (see `canOpenStepThread`).
 */

import type { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";

import type { T3TeamWorkflowStepEntry } from "~/t3team/chat/t3team-threadWorkflowStepProgress";
import { StepTrailing } from "~/t3team/chat/t3team-workflowStepTrailing";
import {
  displayedStepStatus,
  StepStatusIcon,
  type StepStatus,
} from "~/t3team/chat/t3team-workflowStepStatus";
export { displayedStepStatus, StepStatusIcon, type StepStatus };
export { StepTrailing } from "~/t3team/chat/t3team-workflowStepTrailing";

/**
 * Whether a step row should offer to open the step's thread.
 *
 * A step that ran on the thread you are already looking at has nowhere to navigate to. The
 * `describe-rewrite` writer runs via `thread.askAgent` on the LAUNCH thread, so its step rows carried the
 * current thread's id — and the row rendered as a link that opened the same conversation in the side pane.
 * `useOpenSenderThread` already refuses that navigation, but only once the user is on that thread's route;
 * from the work item view the ids differ and it still opened. Deciding it here means the row also stops
 * LOOKING clickable: no chevron, no button, no "Open step thread" label.
 */
export function canOpenStepThread(input: {
  readonly step: Pick<T3TeamWorkflowStepEntry, "projectId" | "threadId">;
  readonly currentThreadId: string | undefined;
  readonly hasHandler: boolean;
}): boolean {
  if (!input.hasHandler || !input.step.projectId || !input.step.threadId) return false;
  return input.step.threadId !== input.currentThreadId;
}

function runtimeDetailLabel(detail: string | undefined): string | null {
  if (!detail) return null;
  const normalized = detail.replaceAll(/\s+/g, " ").trim();
  if (!normalized) return null;
  const contractStart = normalized.search(/\bRespond with ONLY\b/i);
  const useful = contractStart > 0 ? normalized.slice(0, contractStart).trim() : normalized;
  return useful.length <= 96 ? useful : `${useful.slice(0, 95)}…`;
}

function fallbackRuntimeLabel(step: T3TeamWorkflowStepEntry): string {
  switch (step.stepKind) {
    case "workflow.self-heal":
      // The server supplies only these host-authored labels. Do not expose the repair
      // prompt, provider/model identity, or internal runtime kind in the card.
      return step.phase === "failed"
        ? "Repair attempt failed"
        : step.phase === "completed"
          ? "Orchestration recovered"
          : step.detail === "Repairing workflow"
            ? "Repairing orchestration"
            : step.detail === "Resuming workflow"
              ? "Resuming orchestration"
              : "Analysing failure";
    case "thread.turn":
      // Dynamic agent branches may not have a dedicated authored plan row. The emitted prompt
      // is the clearest useful label; avoid the meaningless implementation label "Agent task".
      return runtimeDetailLabel(step.detail) ?? "Current work";
    case "user.input":
      return "Awaiting your input";
    case "read":
      return "Review information";
    case "act":
      return "Apply changes";
    case "wait.until":
      return "Scheduled work";
    default:
      return "Additional orchestration work";
  }
}

export function RuntimeStepRow({
  step,
  wakeAt,
  runStatus,
  childStatuses,
}: {
  step: T3TeamWorkflowStepEntry;
  wakeAt?: string | null | undefined;
  runStatus?: OrchestrationWorkflowRunStatus["status"];
  childStatuses?: Readonly<Record<string, string>> | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5" data-step-runtime="unknown">
      <StepStatusIcon status={displayedStepStatus(step, runStatus)} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
        {fallbackRuntimeLabel(step)}
      </span>
      <StepTrailing step={step} wakeAt={wakeAt} childStatuses={childStatuses} />
    </div>
  );
}
