/**
 * Launch-preview emission for the play-as-shape view (recipe-UX design pass). When a recipe's
 * `.workflow.ts` is launched, the host derives its read-only shape (SDK `deriveWorkflowShape` —
 * a static AST scan, no body execution) and posts it to the launching thread as a system message
 * carrying the `t3work.workflow.shape` view, so the user sees the plan before/while it runs. This
 * mirrors the broker's decision-card emission ({@link ./t3work-workflowEngineBroker.ts}).
 *
 * A run must NEVER be invisible: a derivation failure or an empty shape (no phases, no steps —
 * e.g. an underivable/malformed source that slipped past the precheck) still builds the SAME
 * command with a minimal fallback shape (name from the workflow path, no phases/steps), so a plan
 * card always appears. The caller reads the source and returns early only when it can't (unreadable
 * file / headless launch) — that is the one case this never blocks.
 */

import { CommandId, MessageId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE } from "@t3tools/project-recipes";

import { deriveWorkflowShape } from "@t3work/sdk";

export interface WorkflowShapePreviewInput {
  readonly threadId: string;
  readonly workflowPath: string;
  /** The `.workflow.ts` source, read by the caller (the route, via Effect `FileSystem`). */
  readonly sourceText: string;
  readonly runId: string;
  readonly newId: () => string;
  readonly nowIso: string;
}

/** Basename of `workflowPath` without its `.workflow.ts`/`.ts` extension, or "workflow". */
function deriveFallbackWorkflowName(workflowPath: string): string {
  const base = workflowPath.split(/[/\\]/).pop() ?? "";
  const withoutExtension = base.replace(/\.workflow\.ts$/, "").replace(/\.ts$/, "");
  return withoutExtension.length > 0 ? withoutExtension : "workflow";
}

/**
 * Derive the workflow's shape from its source and build the system-message command that carries
 * the `workflow.shape` view. When the shape can't be derived or there is nothing to show (no
 * phases and no steps), builds the same command with a minimal fallback shape instead — a run
 * must never be invisible.
 */
export function buildWorkflowShapePreviewCommand(
  input: WorkflowShapePreviewInput,
): OrchestrationCommand {
  let derived: ReturnType<typeof deriveWorkflowShape> | null;
  try {
    derived = deriveWorkflowShape({
      absolutePath: input.workflowPath,
      sourceText: input.sourceText,
    });
  } catch {
    derived = null;
  }

  const shape =
    derived === null || (derived.phases.length === 0 && derived.steps.length === 0)
      ? {
          name: deriveFallbackWorkflowName(input.workflowPath),
          description: undefined,
          phases: [],
          steps: [],
        }
      : derived;

  return {
    type: "thread.message.upsert",
    commandId: CommandId.make(`t3work-wf:shape:${input.runId}`),
    threadId: ThreadId.make(input.threadId),
    message: {
      messageId: MessageId.make(input.newId()),
      role: "system",
      text: `Plan: ${shape.name}`,
      turnId: null,
      streaming: false,
      t3workExt: {
        author: { kind: "system", workflowRunId: input.runId },
        visibleToUser: true,
        attachments: [
          {
            kind: "view",
            miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
            props: {
              name: shape.name,
              ...(shape.description === undefined ? {} : { description: shape.description }),
              phases: shape.phases,
              steps: shape.steps,
              workflowRunId: input.runId,
            },
          },
        ],
      },
    },
    createdAt: input.nowIso,
  };
}
