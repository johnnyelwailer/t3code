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
    case "project.dashboard": {
      const dashboardMode = context.surfaceState?.dashboardMode;
      if (dashboardMode === "backlog") {
        return "project dashboard backlog";
      }
      if (dashboardMode === "my-work") {
        return "project dashboard my work";
      }
      return "project dashboard";
    }
    default:
      return context?.surface ?? "current t3work view";
  }
}

function buildRecipeAuthoringContextSummary(
  context: ProjectRecipeRenderContext | undefined,
): ReadonlyArray<string> {
  if (!context) {
    return ["- Surface: current t3work view"];
  }

  const lines = [
    `- Surface: ${formatRecipeAuthoringSurfaceLabel(context)}`,
    `- Project: ${context.project.title}`,
  ];

  if (context.workitem?.displayId || context.workitem?.title) {
    lines.push(
      `- Selected work: ${[context.workitem.displayId, context.workitem.title].filter(Boolean).join(" - ")}`,
    );
  }
  if (context.workitem?.type) {
    lines.push(`- Work type: ${context.workitem.type}`);
  }
  if (context.workitem?.status) {
    lines.push(`- Status: ${context.workitem.status}`);
  }
  if (context.workitem?.priority) {
    lines.push(`- Priority: ${context.workitem.priority}`);
  }
  if (context.surfaceState?.dashboardMode) {
    lines.push(`- Dashboard mode: ${context.surfaceState.dashboardMode}`);
  }
  if (context.surfaceState?.currentView) {
    const currentView = context.surfaceState.currentView;
    const parts = [`${String(currentView.itemCount)} items`];
    if (typeof currentView.bugCount === "number") {
      parts.push(`${String(currentView.bugCount)} bugs`);
    }
    if (currentView.primaryItemLabel) {
      parts.push(`lead item ${currentView.primaryItemLabel}`);
    } else if (currentView.primaryBugLabel) {
      parts.push(`lead bug ${currentView.primaryBugLabel}`);
    }
    lines.push(`- Current view: ${parts.join(", ")}`);
  }
  if ((context.contextAttachments?.length ?? 0) > 0) {
    lines.push(
      `- Context attachments: ${context.contextAttachments
        ?.map((attachment) => attachment.label)
        .join(", ")}`,
    );
  }

  return lines;
}

function buildRecipeAuthoringExamples(
  context: ProjectRecipeRenderContext | undefined,
): ReadonlyArray<string> {
  if (context?.surface === "workitem.detail.sidepanel") {
    return [
      "Review acceptance criteria only when the ticket is still before implementation.",
      "Prepare post-merge closeout when linked PRs are merged but the ticket is not done.",
      "Create a ticket-specific recipe that escalates blocker analysis when dependencies exist.",
    ];
  }

  if (context?.surface === "project.dashboard") {
    if (context.surfaceState?.dashboardMode === "backlog") {
      return [
        "Narrow the backlog to items that still need planning, then shape the next slice.",
        "Surface a stakeholder-update recipe only when the visible slice is a concentrated risk hotspot.",
        "Create a recipe that identifies work missing owners or estimates before asking the agent to prioritize it.",
      ];
    }

    return [
      "Focus review-stage work waiting on you, then rank the next response.",
      "Create a recipe that summarizes unblockers across your active items.",
      "Design a recipe that drafts a handoff only when merged PR activity exists on visible work.",
    ];
  }

  return [
    "Create a prompt-only quick start tuned to the current context.",
    "Create a recipe with a pre-launch action view that captures a few structured options.",
    "Create a recipe that only appears when specific context keys or profile signals are present.",
  ];
}

export function buildRecipeAuthoringKickoffMessage(input: {
  context: ProjectRecipeRenderContext | undefined;
  promptRequest: ProjectRecipeKickoffPromptRequest;
}): string {
  const contextKeys = input.context?.availableContextKeys ?? [];
  const contextKeyLines =
    contextKeys.length > 0
      ? contextKeys.map((key) => `- ${key}`)
      : ["- project.summary", "- availableContextKeys will be populated from the active surface"];
  const sections = input.promptRequest.sections ?? [];
  const lines = [input.promptRequest.title];

  if (input.promptRequest.body?.trim()) {
    lines.push("", input.promptRequest.body.trim());
  }

  if (sections.includes("context-summary")) {
    lines.push("", "Current context", ...buildRecipeAuthoringContextSummary(input.context));
  }

  if (sections.includes("available-context-keys")) {
    lines.push(
      "",
      "Available context data you can use",
      "- Render context fields: project, workitem, linkedResources, contextAttachments, surfaceState, profile, enabledSkillPacks, availableContextKeys.",
      "- Active context keys in this view:",
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
      "Capabilities",
      ...(input.promptRequest.capabilities ?? []).map((capability) => `- ${capability}`),
    );
  }

  if (input.promptRequest.responseInstructions?.trim()) {
    lines.push("", input.promptRequest.responseInstructions.trim());
  }

  return lines.join("\n");
}
