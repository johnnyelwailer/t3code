import type { ProjectRecipeWorkflowLaunch } from "@t3tools/project-recipes";

export function normalizeLegacyWorkflowStep(step: unknown): unknown {
  if (!step || typeof step !== "object") {
    return step;
  }

  const candidate = step as {
    kind?: unknown;
    id?: unknown;
    when?: unknown;
    promptRequest?: unknown;
    actionId?: unknown;
    card?: unknown;
  };

  switch (candidate.kind) {
    case "wait-for-kickoff-input":
      return {
        kind: "collect-input",
        id: candidate.id,
        request: {
          kind: "text",
          ...(candidate.when !== undefined ? { when: candidate.when } : {}),
          promptRequest: candidate.promptRequest,
        },
      };
    case "run-interactive-agent":
      return { kind: "agent", id: candidate.id };
    case "card":
      return { kind: "present-message", id: candidate.id, message: { card: candidate.card } };
    case "await-card-action":
      return {
        kind: "collect-input",
        id: candidate.id,
        request: { kind: "card-action", actionId: candidate.actionId },
      };
    default:
      return step;
  }
}

export function normalizeWorkflowCandidate(candidate: unknown): unknown {
  if (
    !candidate ||
    typeof candidate !== "object" ||
    !Array.isArray((candidate as { steps?: unknown }).steps)
  ) {
    return candidate;
  }

  const workflow = candidate as { version?: unknown; steps: ReadonlyArray<unknown> };
  return {
    ...(workflow.version !== undefined ? { version: workflow.version } : {}),
    steps: workflow.steps.map(normalizeLegacyWorkflowStep),
  };
}

export function normalizeWorkflowLaunch(
  launch: ProjectRecipeWorkflowLaunch,
): ProjectRecipeWorkflowLaunch {
  if (!launch.kickoff) {
    return launch;
  }

  return {
    ...launch,
    kickoff: {
      ...launch.kickoff,
      steps: launch.kickoff.steps.map(normalizeLegacyWorkflowStep) as typeof launch.kickoff.steps,
    },
  };
}
