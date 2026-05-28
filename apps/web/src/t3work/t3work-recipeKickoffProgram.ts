import type {
  ProjectRecipeKickoffProgram,
  ProjectRecipeKickoffPromptRequest,
  ProjectRecipeRenderContext,
  ProjectRecipeWorkflowDocument,
} from "@t3tools/project-recipes";

import { buildRecipeAuthoringKickoffMessage } from "~/t3work/t3work-recipeQuickStartAuthoring";

export type T3workKickoffProgramLaunch = {
  readonly kickoffMessage: string;
  readonly kickoffPending: boolean;
};

function buildKickoffPrompt(prompt: string, customMessage?: string): string {
  const trimmedCustomMessage = customMessage?.trim();
  return trimmedCustomMessage
    ? `${prompt}\n\nAdditional user note:\n${trimmedCustomMessage}`
    : prompt;
}

function isPromptRequest(value: unknown): value is ProjectRecipeKickoffPromptRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

function readTextInputStep(step: unknown): {
  when?: "missing-prompt" | "always";
  promptRequest: ProjectRecipeKickoffPromptRequest;
} | null {
  if (!step || typeof step !== "object") {
    return null;
  }

  const candidate = step as {
    kind?: unknown;
    when?: unknown;
    promptRequest?: unknown;
    request?: { kind?: unknown; when?: unknown; promptRequest?: unknown };
  };

  if (candidate.kind === "wait-for-kickoff-input" && isPromptRequest(candidate.promptRequest)) {
    return {
      ...(candidate.when === "always" || candidate.when === "missing-prompt"
        ? { when: candidate.when }
        : {}),
      promptRequest: candidate.promptRequest,
    };
  }

  if (
    candidate.kind === "collect-input" &&
    candidate.request?.kind === "text" &&
    isPromptRequest(candidate.request.promptRequest)
  ) {
    return {
      ...(candidate.request.when === "always" || candidate.request.when === "missing-prompt"
        ? { when: candidate.request.when }
        : {}),
      promptRequest: candidate.request.promptRequest,
    };
  }

  return null;
}

function isAgentStep(step: unknown): boolean {
  return (
    !!step &&
    typeof step === "object" &&
    ((step as { kind?: unknown }).kind === "run-interactive-agent" ||
      (step as { kind?: unknown }).kind === "agent")
  );
}

function normalizeKickoffStep(
  step: ProjectRecipeKickoffProgram["steps"][number],
): ProjectRecipeWorkflowDocument["steps"][number] {
  const textInput = readTextInputStep(step);
  if (
    textInput &&
    !!step &&
    typeof step === "object" &&
    (step as { kind?: unknown }).kind === "wait-for-kickoff-input"
  ) {
    return {
      kind: "collect-input",
      id: (step as { id: string }).id,
      request: {
        kind: "text",
        ...(textInput.when ? { when: textInput.when } : {}),
        promptRequest: textInput.promptRequest,
      },
    };
  }

  if (
    isAgentStep(step) &&
    !!step &&
    typeof step === "object" &&
    (step as { kind?: unknown }).kind === "run-interactive-agent"
  ) {
    return {
      kind: "agent",
      id: (step as { id: string }).id,
    };
  }

  return step as ProjectRecipeWorkflowDocument["steps"][number];
}

export function normalizeT3workKickoffProgram(
  program: ProjectRecipeKickoffProgram | undefined,
): ProjectRecipeWorkflowDocument | undefined {
  if (!program) {
    return undefined;
  }

  return {
    steps: program.steps.map(normalizeKickoffStep),
  };
}

export function hasGuidedKickoffInputStep(
  program: ProjectRecipeKickoffProgram | undefined,
): boolean {
  return program?.steps.some((step) => readTextInputStep(step) !== null) ?? false;
}

export function buildT3workKickoffLaunchFromProgram(input: {
  readonly program: ProjectRecipeKickoffProgram;
  readonly prompt: string;
  readonly customMessage?: string;
  readonly context: ProjectRecipeRenderContext | undefined;
}): T3workKickoffProgramLaunch | null {
  const trimmedCustomMessage = input.customMessage?.trim();

  for (const step of input.program.steps) {
    const textInput = readTextInputStep(step);
    if (textInput) {
      if (textInput.when === "always" || !trimmedCustomMessage) {
        return {
          kickoffMessage: buildRecipeAuthoringKickoffMessage({
            context: input.context,
            promptRequest: textInput.promptRequest,
          }),
          kickoffPending: false,
        };
      }
      continue;
    }

    if (isAgentStep(step)) {
      return {
        kickoffMessage: buildKickoffPrompt(input.prompt, input.customMessage),
        kickoffPending: true,
      };
    }
  }

  return null;
}
