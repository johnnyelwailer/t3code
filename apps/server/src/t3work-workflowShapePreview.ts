/**
 * Launch-preview emission for the play-as-shape view (recipe-UX design pass). When a recipe's
 * `.workflow.ts` is launched, the host derives its read-only shape (SDK `deriveWorkflowShape` —
 * a static AST scan, no body execution) and posts it to the launching thread as a system message
 * carrying the `t3work.workflow.shape` view, so the user sees the plan before/while it runs. This
 * mirrors the broker's decision-card emission ({@link ./t3work-workflowEngineBroker.ts}); it is
 * best-effort — the caller reads the source (returning early when it can't), and a derivation
 * failure or an empty shape returns null here, so neither ever blocks the launch.
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

/**
 * Derive the workflow's shape from its source and build the system-message command that carries
 * the `workflow.shape` view. Returns null when the shape can't be derived or there is nothing to
 * show (no phases and no steps).
 */
export function buildWorkflowShapePreviewCommand(
  input: WorkflowShapePreviewInput,
): OrchestrationCommand | null {
  let shape: ReturnType<typeof deriveWorkflowShape>;
  try {
    shape = deriveWorkflowShape({ absolutePath: input.workflowPath, sourceText: input.sourceText });
  } catch {
    return null;
  }
  if (shape.phases.length === 0 && shape.steps.length === 0) {
    return null;
  }

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
