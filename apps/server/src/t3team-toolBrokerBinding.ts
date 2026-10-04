import type { ThreadId } from "@t3tools/contracts";
import { PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID } from "@t3tools/project-recipes";

import type {
  T3TeamPrelaunchToolBinding,
  T3TeamToolBinding,
  T3TeamTurnToolContext,
} from "./t3team-toolBroker.ts";
import { createToolSurface, type CreateBindingInput } from "./t3team-toolBrokerBindingSurface.ts";

export type { CreateBindingInput } from "./t3team-toolBrokerBindingSurface.ts";

export function createT3TeamThreadToolBinding<
  TRenameError,
  TStartChildError,
  TReadError,
  TBacklogAssigneeFilterError,
>(
  input: Omit<
    CreateBindingInput<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>,
    "scopeLabel" | "prelaunchOnly"
  > & {
    readonly threadId: ThreadId;
    readonly toolContext: T3TeamTurnToolContext;
  },
): T3TeamToolBinding {
  return {
    threadId: input.threadId,
    ...createToolSurface({
      ...input,
      scopeLabel: "for this thread.",
    }),
  };
}

export function createT3TeamPrelaunchToolBinding<
  TRenameError,
  TStartChildError,
  TReadError,
  TBacklogAssigneeFilterError,
>(
  input: Omit<
    CreateBindingInput<TRenameError, TStartChildError, TReadError, TBacklogAssigneeFilterError>,
    "availableToolIds" | "prelaunchOnly" | "scopeLabel"
  > & {
    readonly workspaceRoot: string;
    readonly callerKind: "visibility" | "view.preRender";
  },
): T3TeamPrelaunchToolBinding {
  return {
    bindingKey: `${input.callerKind}:${input.workspaceRoot}`,
    ...createToolSurface({
      ...input,
      availableToolIds: Object.keys(PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID),
      prelaunchOnly: true,
      scopeLabel: `during ${input.callerKind} evaluation.`,
    }),
  };
}
