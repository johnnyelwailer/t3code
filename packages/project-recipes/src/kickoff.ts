import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { ProjectRecipePromptGuideSection, ProjectRecipePromptRequest } from "./input.ts";
import { ProjectRecipeWorkflowStep } from "./runtime.ts";

export const ProjectRecipeKickoffGuideSection = ProjectRecipePromptGuideSection;
export type ProjectRecipeKickoffGuideSection = typeof ProjectRecipeKickoffGuideSection.Type;

export const ProjectRecipeKickoffPromptRequest = ProjectRecipePromptRequest;
export type ProjectRecipeKickoffPromptRequest = typeof ProjectRecipeKickoffPromptRequest.Type;

const ProjectRecipeLegacyKickoffCollectInputStep = Schema.Struct({
  kind: Schema.Literal("wait-for-kickoff-input"),
  id: Schema.String,
  when: Schema.optional(Schema.Literals(["missing-prompt", "always"])),
  promptRequest: ProjectRecipeKickoffPromptRequest,
});

const ProjectRecipeLegacyKickoffAgentStep = Schema.Struct({
  kind: Schema.Literal("run-interactive-agent"),
  id: Schema.String,
});

const ProjectRecipeKickoffStepSource = Schema.Union([
  ProjectRecipeWorkflowStep,
  ProjectRecipeLegacyKickoffCollectInputStep,
  ProjectRecipeLegacyKickoffAgentStep,
]);
export const ProjectRecipeKickoffStep = ProjectRecipeWorkflowStep;
export type ProjectRecipeKickoffStep = typeof ProjectRecipeKickoffStep.Type;

function normalizeKickoffStep(
  step: typeof ProjectRecipeKickoffStepSource.Type,
): ProjectRecipeKickoffStep {
  switch (step.kind) {
    case "wait-for-kickoff-input":
      return {
        kind: "collect-input",
        id: step.id,
        request: {
          kind: "text",
          ...(step.when !== undefined ? { when: step.when } : {}),
          promptRequest: step.promptRequest,
        },
      };
    case "run-interactive-agent":
      return {
        kind: "agent",
        id: step.id,
      };
    default:
      return step;
  }
}

const ProjectRecipeKickoffProgramSource = Schema.Struct({
  version: Schema.optional(Schema.Number),
  steps: Schema.Array(ProjectRecipeKickoffStepSource),
});

const ProjectRecipeKickoffProgramTarget = Schema.Struct({
  version: Schema.optional(Schema.Number),
  steps: Schema.Array(ProjectRecipeKickoffStep),
});

export const ProjectRecipeKickoffProgram = ProjectRecipeKickoffProgramSource.pipe(
  Schema.decodeTo(
    ProjectRecipeKickoffProgramTarget,
    SchemaTransformation.transformOrFail({
      decode: (raw) => {
        const normalized: Record<string, unknown> = {
          steps: raw.steps.map(normalizeKickoffStep),
        };
        if (raw.version !== undefined) {
          normalized.version = raw.version;
        }
        return Effect.succeed(normalized as typeof ProjectRecipeKickoffProgramTarget.Encoded);
      },
      encode: (value) => {
        const encoded: Record<string, unknown> = {
          steps: [...value.steps],
        };
        if (value.version !== undefined) {
          encoded.version = value.version;
        }
        return Effect.succeed(encoded as typeof ProjectRecipeKickoffProgramSource.Encoded);
      },
    }),
  ),
);
export type ProjectRecipeKickoffProgram = typeof ProjectRecipeKickoffProgram.Type;
