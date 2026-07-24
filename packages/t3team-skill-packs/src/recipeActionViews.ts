export const EXPLAIN_SELECTED_WORK_ACTION_VIEW = `
export default function Action() {
  return (
    <RecipeAction
      title="Explain simply"
      icon="sparkles"
    >
      <LaunchOptionGroup
        name="explanationAudience"
        label="Explain for"
        defaultValue="teammate"
        options={[
          {
            value: "teammate",
            label: "Teammate",
            promptText: "Keep the explanation concise and teammate-facing.",
          },
          {
            value: "stakeholder",
            label: "Stakeholder",
            promptText: "Keep jargon low and lead with user impact and outcome.",
          },
          {
            value: "qa",
            label: "QA",
            promptText: "Bias toward behavior changes, checks, and open verification questions.",
          },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const CREATE_CONTEXTUAL_RECIPE_ACTION_VIEW = `
export default function Action({ ctx }) {
  const dashboardMode = ctx.surfaceState?.dashboardMode;
  const description =
    ctx.surface === "workitem.detail.sidepanel"
      ? "Let the agent handle repeatable ticket work: draft a handoff, check QA gaps, or trace blockers."
      : dashboardMode === "my-work"
        ? "Let the agent handle repeatable queue work: rank next actions, surface unblockers, or prep handoffs."
        : dashboardMode === "backlog"
          ? "Let the agent handle repeatable backlog work: triage risk, shape the next slice, or flag missing owners."
          : "Let the agent handle repeatable work here: triage, review, or prep a handoff.";

  return (
    <RecipeAction
      title="Create a recipe for this view"
      icon="sparkles"
      description={description}
    />
  );
}
`;

export const REVIEW_ACCEPTANCE_CRITERIA_ACTION_VIEW = `
export default function Action({ ctx }) {
  return (
    <RecipeAction
      title="Review acceptance criteria"
      icon="clipboard-list"
    >
      <LaunchOptionGroup
        name="acceptanceLens"
        label="Review for"
        defaultValue="ambiguity"
        options={[
          {
            value: "ambiguity",
            label: "Ambiguity",
            promptText: "Lead with ambiguity, hidden assumptions, and missing decision points.",
          },
          {
            value: "qa",
            label: "QA",
            promptText: "Bias toward testability gaps, edge cases, and regression coverage.",
          },
          {
            value: "handoff",
            label: "Handoff",
            promptText: "Bias toward implementation clarity, dependencies, and unresolved scope.",
          },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const SUMMARIZE_PROJECT_RISK_ACTION_VIEW = `
export default function Action({ ctx }) {
  const itemCount = ctx.surfaceState?.currentView?.itemCount ?? 0;
  const bugCount = ctx.surfaceState?.currentView?.bugCount ?? 0;

  return (
    <RecipeAction
      title="Summarize project risk"
      icon="triangle-alert"
    >
      <FieldList
        items={[
          { label: "Items", value: String(itemCount) },
          { label: "Bugs", value: String(bugCount) },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const PRIORITIZE_PENDING_WORK_ACTION_VIEW = `
export default function Action({ ctx }) {
  const itemCount = ctx.surfaceState?.currentView?.itemCount ?? 0;
  const bugCount = ctx.surfaceState?.currentView?.bugCount ?? 0;

  return (
    <RecipeAction
      title="Prioritize pending work"
      icon="list-todo"
    >
      <FieldList
        items={[
          { label: "Items", value: String(itemCount) },
          { label: "Bugs", value: String(bugCount) },
        ]}
      />
      <LaunchOptionGroup
        name="priorityLens"
        label="Prioritize for"
        defaultValue="impact"
        options={[
          {
            value: "impact",
            label: "Impact",
            promptText: "Optimize for immediate user impact and downstream value.",
          },
          {
            value: "unblock",
            label: "Unblock",
            promptText: "Optimize for the item that unlocks the most follow-on work.",
          },
          {
            value: "risk",
            label: "Risk",
            promptText: "Optimize for burning down the highest delivery or quality risk first.",
          },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const FOCUS_NEEDS_MY_ACTION_ACTION_VIEW = `
export default function Action({ ctx }) {
  const itemCount = ctx.surfaceState?.currentView?.itemCount ?? 0;
  const bugCount = ctx.surfaceState?.currentView?.bugCount ?? 0;

  return (
    <RecipeAction
      title="Show what needs my action"
      icon="list-filter"
      description="Filter the current view to the slice most likely waiting on you, then explain the next best move."
    >
      <FieldList
        items={[
          { label: "Visible items", value: String(itemCount) },
          { label: "Bugs", value: String(bugCount) },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const SHOW_ONLY_ASSIGNED_TO_ME_ACTION_VIEW = `
export default function Action() {
  return (
    <RecipeAction
      title="Show only assigned to me"
      icon="list-filter"
      description="Apply the assignee filter inline and stay on the dashboard."
      footer={<InlineActionChip recipeId="show-only-assigned-to-me" label="Apply filter" />}
    />
  );
}
`;

export const CLEAR_FILTERS_ACTION_VIEW = `
export default function Action() {
  return (
    <RecipeAction
      title="Clear filters"
      icon="list-filter"
      description="Reset active view filters to the default slice."
    />
  );
}
`;

export const SHAPE_NEXT_BACKLOG_SLICE_ACTION_VIEW = `
export default function Action({ ctx }) {
  const itemCount = ctx.surfaceState?.currentView?.itemCount ?? 0;
  const bugCount = ctx.surfaceState?.currentView?.bugCount ?? 0;

  return (
    <RecipeAction
      title="Shape the next backlog slice"
      icon="list-filter"
    >
      <FieldList
        items={[
          { label: "Items", value: String(itemCount) },
          { label: "Bugs", value: String(bugCount) },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const UNBLOCK_MY_WORK_ACTION_VIEW = `
export default function Action({ ctx }) {
  const itemCount = ctx.surfaceState?.currentView?.itemCount ?? 0;
  const bugCount = ctx.surfaceState?.currentView?.bugCount ?? 0;

  return (
    <RecipeAction
      title="Unblock my work"
      icon="arrow-up-right"
    >
      <FieldList
        items={[
          { label: "Items", value: String(itemCount) },
          { label: "Bugs", value: String(bugCount) },
        ]}
      />
    </RecipeAction>
  );
}
`;

export const UNBLOCK_BLOCKED_TICKET_ACTION_VIEW = `
export default function Action({ ctx }) {
  const blockedByKeys = ctx.workitem?.relationships?.blockedByKeys ?? [];
  const primaryBlockedByKey = blockedByKeys[0];
  const blockerResource =
    (primaryBlockedByKey
      ? ctx.linkedResources?.find(
          (resource) =>
            resource.kind === "jira.issue" &&
            resource.raw?.relationship === "blocked-by" &&
            (resource.id === primaryBlockedByKey || resource.label === primaryBlockedByKey),
        )
      : undefined) ??
    ctx.linkedResources?.find(
      (resource) =>
        resource.kind === "jira.issue" && resource.raw?.relationship === "blocked-by",
    );
  const blockerLabel = blockerResource?.label ?? primaryBlockedByKey ?? "Linked blocker";
  const blockerTitle = blockerResource?.title;
  const blockerStatus = blockerResource?.raw?.status;
  const blockerIssueType = blockerResource?.raw?.issueType;
  const blockerIssueTypeIconUrl = blockerResource?.raw?.issueTypeIconUrl;
  const blockerPriority = blockerResource?.raw?.priority;
  const additionalBlockerCount = Math.max(0, blockedByKeys.length - 1);

  return (
    <RecipeAction
      title="Unblock this item"
      icon="arrow-up-right"
      eyebrow="Primary blocker"
      description="Identify the blocker that is actually constraining progress, recommend the next move to clear it, and give a fallback if it stays blocked."
    >
      {primaryBlockedByKey || blockerResource ? (
        <JiraInlineIssue
          displayId={blockerLabel}
          title={blockerTitle}
          issueType={blockerIssueType}
          issueTypeIconUrl={blockerIssueTypeIconUrl}
          status={blockerStatus}
          priority={blockerPriority}
        />
      ) : null}
      {additionalBlockerCount > 0 ? (
        <div className="text-[11px] leading-5 text-muted-foreground/80">
          +{String(additionalBlockerCount)} more linked blocker{additionalBlockerCount === 1 ? "" : "s"}
        </div>
      ) : null}
    </RecipeAction>
  );
}
`;

export const TECHNICAL_IMPLEMENTATION_PLAN_ACTION_VIEW = `
export default function Action() {
  return (
    <RecipeAction
      title="Draft implementation plan"
      icon="code-2"
    >
      <LaunchOptionGroup
        name="planDepth"
        label="Depth"
        defaultValue="outline"
        options={[
          {
            value: "outline",
            label: "Outline",
            promptText: "Keep the plan tight and sequence-focused.",
          },
          {
            value: "detailed",
            label: "Detailed",
            promptText: "Expand the plan with failure modes, validation, and rollout considerations.",
          },
        ]}
      />
      <LaunchTextInput
        name="focusArea"
        label="Extra focus"
        placeholder="Optional subsystem, risk, or dependency"
        promptTemplate="Pay extra attention to {{value}}."
      />
    </RecipeAction>
  );
}
`;

export const TSHIRT_SIZE_EPIC_ACTION_VIEW = `
export default function Action() {
  return (
    <RecipeAction
      title="T-shirt-size this epic"
      icon="ruler"
      description="Combine Jira scope, related work, code evidence, and unknowns into an XS/S/M/L/XL estimate."
    >
      <LaunchOptionGroup
        name="sizingLens"
        label="Sizing lens"
        defaultValue="evidence"
        options={[
          {
            value: "evidence",
            label: "Evidence-based",
            promptText:
              "Ground the size in Jira details, linked work, code implementation status, acceptance criteria, and unknowns before naming a size.",
          },
          {
            value: "gut",
            label: "Gut check",
            promptText:
              "Lead with a fast gut size, then briefly justify it from the epic scope.",
          },
          {
            value: "comparative",
            label: "Comparative",
            promptText:
              "Compare against similar past epics or stories when available, and explain where this epic is smaller, larger, or riskier.",
          },
        ]}
      />
    </RecipeAction>
  );
}
`;
