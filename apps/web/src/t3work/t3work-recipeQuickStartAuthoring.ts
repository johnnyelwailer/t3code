import { queryableToReadonlyArray } from "@t3tools/project-context";
import type {
  ProjectRecipeKickoffPromptRequest,
  ProjectRecipeRenderContext,
} from "@t3tools/project-recipes";

function formatRecipeAuthoringSurfaceLabel(
  context: ProjectRecipeRenderContext | undefined,
): string {
  switch (context?.surface) {
    case "workitem.detail.sidepanel":
      return "ticket detail";
    case "project.dashboard.backlog":
      return "backlog view";
    case "project.dashboard.myWork":
      return "my work view";
    default:
      return context?.surface ?? "current t3work view";
  }
}

function buildRecipeAuthoringContextSummary(
  context: ProjectRecipeRenderContext | undefined,
): ReadonlyArray<string> {
  if (!context) {
    return ["- View: current t3work view"];
  }

  const lines = [
    `- View: ${formatRecipeAuthoringSurfaceLabel(context)}`,
    `- Project: ${context.project.title}`,
  ];

  const currentFocus = [context.workitem?.displayId, context.workitem?.title]
    .filter(Boolean)
    .join(" - ");
  if (currentFocus) {
    lines.push(`- Current focus: ${currentFocus}`);
  } else if (
    context.surface === "project.dashboard.backlog" ||
    context.surface === "project.dashboard.myWork"
  ) {
    lines.push("- Current focus: Everything visible in this view");
  }
  if (context.workitem?.type) {
    lines.push(`- Type: ${context.workitem.type}`);
  }
  if (context.workitem?.status) {
    lines.push(`- Status: ${context.workitem.status}`);
  }
  if (context.workitem?.priority) {
    lines.push(`- Priority: ${context.workitem.priority}`);
  }
  if (context.surfaceState?.currentView) {
    const currentView = context.surfaceState.currentView;
    const parts = [`${String(currentView.itemCount)} items`];
    if (typeof currentView.bugCount === "number") {
      parts.push(`${String(currentView.bugCount)} bugs`);
    }
    if (currentView.primaryItemLabel) {
      parts.push(`top item ${currentView.primaryItemLabel}`);
    } else if (currentView.primaryBugLabel) {
      parts.push(`top bug ${currentView.primaryBugLabel}`);
    }
    lines.push(`- Visible work: ${parts.join(", ")}`);
  }
  const contextAttachments = queryableToReadonlyArray(context.contextAttachments);
  if (contextAttachments.length > 0) {
    lines.push(
      `- Extra references: ${contextAttachments.map((attachment) => attachment.label).join(", ")}`,
    );
  }

  return lines;
}

function buildRecipeAuthoringExamples(
  context: ProjectRecipeRenderContext | undefined,
): ReadonlyArray<string> {
  if (context?.surface === "workitem.detail.sidepanel") {
    return [
      "Draft a handoff or validation checklist from the current ticket.",
      "Show a closeout helper only when linked PRs are merged but the ticket is not done.",
      "Show a blocker-triage recipe only when this ticket has dependencies.",
    ];
  }

  if (context?.surface === "project.dashboard.backlog") {
    return [
      "Shape the next planning slice from the visible backlog.",
      "Show a stakeholder-update shortcut only when this backlog slice looks risky.",
      "Highlight work that still needs an owner or estimate before prioritizing it.",
    ];
  }

  if (context?.surface === "project.dashboard.myWork") {
    return [
      "Rank the work waiting on you right now.",
      "Create a recipe that summarizes unblockers across your active items.",
      "Draft a handoff only when merged PR activity appears on visible work.",
    ];
  }

  return [
    "Create a quick action that sends a tailored prompt for this view.",
    "Create a recipe that asks a couple of setup questions before it runs.",
    "Create a recipe that only appears when this view matches the right signals.",
  ];
}

export function buildRecipeAuthoringKickoffMessage(input: {
  context: ProjectRecipeRenderContext | undefined;
  promptRequest: ProjectRecipeKickoffPromptRequest;
}): string {
  const contextKeys = input.context
    ? queryableToReadonlyArray(input.context.availableContextKeys)
    : [];
  const contextKeyLines =
    contextKeys.length > 0
      ? contextKeys.map((key) => `- ${key}`)
      : [
          "- project.summary",
          "- More view-specific signals will appear here when they are available.",
        ];
  const sections = input.promptRequest.sections ?? [];
  const lines = [input.promptRequest.title];

  if (input.promptRequest.body?.trim()) {
    lines.push("", input.promptRequest.body.trim());
  }

  if (sections.includes("context-summary")) {
    lines.push(
      "",
      "What the agent can already see",
      ...buildRecipeAuthoringContextSummary(input.context),
    );
  }

  if (sections.includes("available-context-keys")) {
    lines.push(
      "",
      "Signals this recipe can use",
      "- Recipes can react to what is visible here: the current project, the current ticket or queue, linked items, attached references, your working style defaults, and the structured signals below.",
      "- Structured signals available right now:",
      ...contextKeyLines,
    );
  }

  const examples = input.promptRequest.examples?.length
    ? input.promptRequest.examples
    : buildRecipeAuthoringExamples(input.context);
  if (examples.length > 0) {
    lines.push(
      "",
      "Examples of recipes you can build here",
      ...examples.map((example) => `- ${example}`),
    );
  }

  if (sections.includes("capabilities") && (input.promptRequest.capabilities?.length ?? 0) > 0) {
    lines.push(
      "",
      "What a recipe can do",
      ...(input.promptRequest.capabilities ?? []).map((capability) => `- ${capability}`),
    );
  }

  if (input.promptRequest.responseInstructions?.trim()) {
    lines.push("", input.promptRequest.responseInstructions.trim());
  }

  return lines.join("\n");
}
