import { ThreadId } from "@t3tools/contracts";
import type { T3workActionRecipeContext } from "@t3tools/project-context";
import type { ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType } from "@t3tools/project-recipes";
import * as Effect from "effect/Effect";

import { materializeRecipeWorkflowRun } from "./t3work-recipeWorkflowRunMaterialization.ts";
import { normalizeWorkflowLaunch } from "./t3work-recipeWorkflowRuntimeNormalization.ts";
import {
  readLaunchPromptText,
  readLaunchWorkflowDocument,
} from "./t3work-recipeWorkflowRuntimeHelpers.ts";
import { workflowRunIdForDeterministicLaunch } from "./t3work-recipeWorkflowRuntimeShared.ts";
import { T3workToolBroker, type T3workTurnToolContext } from "./t3work-toolBroker.ts";

export type DeterministicRecipeWorkflowLaunchEffect = {
  readonly kind: "view-state-patch";
  readonly stepId: string;
  readonly toolName: string;
  readonly statePatch: Readonly<Record<string, unknown>>;
  readonly promptText?: string;
};

export type DeterministicRecipeWorkflowLaunchResult = {
  readonly workflowRunId: string;
  readonly effects: ReadonlyArray<DeterministicRecipeWorkflowLaunchEffect>;
  readonly completionActivity: {
    readonly title: string;
    readonly description?: string;
    readonly tone: "success" | "info";
  };
};

function readStructuredResultRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Readonly<Record<string, unknown>>;
}

function readToolResultPromptText(
  value: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  return typeof value?.promptText === "string" && value.promptText.trim().length > 0
    ? value.promptText.trim()
    : undefined;
}

function readToolResultStatePatch(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  const patch = value?.viewStatePatch;
  return patch && typeof patch === "object" && !Array.isArray(patch)
    ? (patch as Readonly<Record<string, unknown>>)
    : undefined;
}

export const runDeterministicProjectRecipeWorkflowLaunch = Effect.fn(
  "runDeterministicProjectRecipeWorkflowLaunch",
)(function* (input: {
  workspaceRoot: string;
  launch: ProjectRecipeWorkflowLaunchType;
  launchContext?: T3workActionRecipeContext;
  kickoffMessage?: string;
  createdAt: string;
  toolContext: T3workTurnToolContext;
}) {
  const launch = normalizeWorkflowLaunch(input.launch);
  const toolBroker = yield* T3workToolBroker;
  const workflowRunId = workflowRunIdForDeterministicLaunch();
  const seedPromptText = yield* readLaunchPromptText({
    workspaceRoot: input.workspaceRoot,
    launch,
    fallbackPromptText: input.kickoffMessage ?? "",
  });
  const workflowDocument = yield* readLaunchWorkflowDocument({
    workspaceRoot: input.workspaceRoot,
    launch,
  });
  const steps = [...(launch.kickoff?.steps ?? []), ...workflowDocument.steps];

  if (steps.some((step) => step.kind === "agent")) {
    throw new Error("Deterministic recipe launches cannot include agent steps.");
  }

  yield* materializeRecipeWorkflowRun({
    workspaceRoot: input.workspaceRoot,
    workflowRunId,
    launch,
    promptText: seedPromptText,
    ...(input.launchContext ? { launchContext: input.launchContext } : {}),
    copyRecipeFiles: true,
  });

  const binding = steps.some((step) => step.kind === "tool")
    ? yield* toolBroker.bindSession({
        threadId: ThreadId.make(`deterministic-${workflowRunId}`),
        toolContext: input.toolContext,
        allowedToolGroups: launch.allowedToolGroups ?? [],
      })
    : undefined;

  const notes: string[] = [];
  const effects: DeterministicRecipeWorkflowLaunchEffect[] = [];
  let appliedViewStatePatch = false;

  for (const step of steps) {
    switch (step.kind) {
      case "tool": {
        if (!binding) {
          throw new Error(`No t3work tool binding is available for '${step.toolName}'.`);
        }

        const result = yield* binding.callTool({
          server: "t3work",
          tool: step.toolName,
          ...(step.input ? { arguments: step.input } : {}),
        });
        const detail = result.content
          .map((entry) => entry.text.trim())
          .filter(Boolean)
          .join("\n");

        if (result.isError) {
          throw new Error(
            detail.length > 0 ? detail : `Workflow tool step '${step.id}' failed to execute.`,
          );
        }

        const structuredContent = readStructuredResultRecord(result.structuredContent);
        const promptText = readToolResultPromptText(structuredContent);
        const statePatch = readToolResultStatePatch(structuredContent);

        if (promptText) {
          notes.push(promptText);
        }
        if (statePatch) {
          effects.push({
            kind: "view-state-patch",
            stepId: step.id,
            toolName: step.toolName,
            statePatch,
            ...(promptText ? { promptText } : {}),
          });
        }
        if (structuredContent?.applied === true) {
          appliedViewStatePatch = true;
        }
        break;
      }

      case "present-message":
        if ((step.message.body?.trim().length ?? 0) > 0) {
          notes.push(step.message.body!.trim());
        }
        break;

      case "collect-input":
        throw new Error("collect-input steps are not supported for deterministic launches.");

      case "script":
        throw new Error("script steps are not supported for deterministic launches.");
    }
  }

  const description = notes.join("\n\n").trim();

  return {
    workflowRunId,
    effects,
    completionActivity: {
      title: launch.title,
      ...(description.length > 0 ? { description } : {}),
      tone: appliedViewStatePatch ? "success" : "info",
    },
  } satisfies DeterministicRecipeWorkflowLaunchResult;
});
