import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

/**
 * Pure serialization of a thread's kickoff state into the turn tool context's `state.kickoff`
 * shape. Split out of t3team-threadToolContext.ts to keep that file's main builder readable.
 */
export function buildT3TeamKickoffState(input: {
  readonly kickoffMessage?: string;
  readonly kickoffPending?: boolean;
  readonly kickoffWorkflow?: T3TeamKickoffWorkflow;
}): Readonly<Record<string, unknown>> | undefined {
  if (!input.kickoffMessage && !input.kickoffWorkflow && input.kickoffPending === undefined) {
    return undefined;
  }

  const workflow = input.kickoffWorkflow;

  return {
    ...(input.kickoffMessage ? { message: input.kickoffMessage } : {}),
    ...(input.kickoffPending !== undefined ? { pending: input.kickoffPending } : {}),
    ...(workflow
      ? {
          workflow: {
            kind: workflow.kind,
            recipeId: workflow.recipeId,
            ...(workflow.recipeVersion ? { recipeVersion: workflow.recipeVersion } : {}),
            ...(workflow.parameters ? { parameters: workflow.parameters } : {}),
            title: workflow.title,
            description: workflow.description,
            source: workflow.source,
            surface: workflow.surface,
            ...(workflow.kickoff ? { kickoff: workflow.kickoff } : {}),
            ...(workflow.reason ? { reason: workflow.reason } : {}),
            ...(workflow.recipePath ? { recipePath: workflow.recipePath } : {}),
            ...(workflow.promptPath ? { promptPath: workflow.promptPath } : {}),
            ...(workflow.workflowPath ? { workflowPath: workflow.workflowPath } : {}),
            ...(workflow.allowedToolGroups
              ? { allowedToolGroups: workflow.allowedToolGroups }
              : {}),
            ...(workflow.launchContext ? { launchContext: workflow.launchContext } : {}),
          },
        }
      : {}),
  };
}
