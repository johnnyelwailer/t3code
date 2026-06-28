import type { Recipe } from "@t3tools/project-recipes";
import { recipeSignalPredicates } from "@t3tools/project-recipes";

import {
  CLEAR_FILTERS_ACTION_VIEW,
  CREATE_CONTEXTUAL_RECIPE_ACTION_VIEW,
  EXPLAIN_SELECTED_WORK_ACTION_VIEW,
  FOCUS_NEEDS_MY_ACTION_ACTION_VIEW,
  PRIORITIZE_PENDING_WORK_ACTION_VIEW,
  REVIEW_ACCEPTANCE_CRITERIA_ACTION_VIEW,
  SHOW_ONLY_ASSIGNED_TO_ME_ACTION_VIEW,
  SHAPE_NEXT_BACKLOG_SLICE_ACTION_VIEW,
  TECHNICAL_IMPLEMENTATION_PLAN_ACTION_VIEW,
  TSHIRT_SIZE_EPIC_ACTION_VIEW,
  UNBLOCK_BLOCKED_TICKET_ACTION_VIEW,
} from "./recipeActionViews.ts";

export type BundledT3WorkRecipe = Recipe & {
  readonly topic: string;
  readonly version: string;
  readonly manifestDisplayName: string;
  readonly allowedToolGroups: ReadonlyArray<string>;
  readonly actionViewTemplate?: string;
  readonly composerGuidance?: {
    readonly helperText?: string;
    readonly placeholder?: string;
  };
};

const DEFAULT_ALLOWED_TOOL_GROUPS = ["integration.read", "artifact.rw", "ui.render"] as const;
const DASHBOARD_SURFACES = ["project.dashboard.backlog", "project.dashboard.myWork"] as const;
const DASHBOARD_AND_WORKITEM_SURFACES = [
  ...DASHBOARD_SURFACES,
  "workitem.detail.sidepanel",
] as const;
const BACKLOG_DASHBOARD_SURFACE = ["project.dashboard.backlog"] as const;

function createBundledRecipe(
  recipe: Omit<BundledT3WorkRecipe, "version" | "allowedToolGroups"> & {
    readonly allowedToolGroups?: ReadonlyArray<string>;
  },
): BundledT3WorkRecipe {
  return {
    version: "0.1.0",
    allowedToolGroups: recipe.allowedToolGroups ?? DEFAULT_ALLOWED_TOOL_GROUPS,
    ...recipe,
  };
}

const BUNDLED_RECIPES: ReadonlyArray<BundledT3WorkRecipe> = [
  createBundledRecipe({
    topic: "customize",
    id: "create-recipe",
    title: "Create a project-local recipe",
    manifestDisplayName: "Create a project-local recipe",
    shortDescription:
      "Scaffold a reusable recipe in .t3work/recipes and have the agent finish the files.",
    surfaces: DASHBOARD_AND_WORKITEM_SURFACES,
    promptTemplate:
      "Create a reusable t3work recipe for this project. Describe what the recipe should do, where it should appear, the signals it should use, and any setup fields it needs before launch.",
    kickoff: {
      version: 1,
      steps: [
        {
          kind: "collect-input",
          id: "collect-recipe-brief",
          request: {
            kind: "text",
            when: "missing-prompt",
            promptRequest: {
              title: "Describe the recipe you want to create",
              body: "Tell the agent what the recipe should help with, where it should appear, which project or ticket signals it should react to, and whether it needs a small setup form before it runs.",
              sections: ["context-summary", "available-context-keys", "capabilities"],
              capabilities: [
                "Create a new recipe under .t3work/recipes/<recipe-id>.",
                "Author recipe.json, prompt.md, workflow.ts, and helper script files when needed.",
                "Use project and ticket context signals to control where the recipe appears.",
                "Build a multi-step workflow when a single kickoff prompt is not enough.",
              ],
              responseInstructions:
                "Describe the recipe goal, target surface, visibility rules, and any setup or workflow steps it should include.",
            },
          },
        },
        {
          kind: "tool",
          id: "read-current-view",
          toolName: "t3work.view.read",
        },
        {
          kind: "script",
          id: "prepare-authoring-workspace",
          module: "./recipe-script.ts#prepareAuthoringWorkspace",
        },
        {
          kind: "agent",
          id: "author-recipe",
        },
        {
          kind: "present-message",
          id: "recipe-ready",
          message: {
            body: "Recipe authoring turn finished. Review the new or updated files under .t3work/recipes and run the flow again if you want another pass.",
            visibleToAgent: false,
          },
        },
      ],
    },
    icon: "sparkles",
    appliesTo: {},
    requiredContext: [{ key: "project.summary", description: "Project overview" }],
    skillRef: { id: "recipe.create" },
    outputPreference: "plan",
    artifactKinds: ["implementation-plan", "decision-notes"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 19,
  }),
  createBundledRecipe({
    topic: "customize",
    id: "edit-plugin-module",
    title: "Edit this item",
    manifestDisplayName: "Edit this item",
    shortDescription:
      "Draft and apply a surgical update to an existing project-local recipe or plugin module.",
    surfaces: DASHBOARD_AND_WORKITEM_SURFACES,
    promptTemplate:
      "Edit an existing t3work recipe or plugin module. Describe the change you want, and keep the current module shape unless the request explicitly changes it.",
    kickoff: {
      version: 1,
      steps: [
        {
          kind: "collect-input",
          id: "collect-edit-brief",
          request: {
            kind: "text",
            when: "missing-prompt",
            promptRequest: {
              title: "Describe the edit you want",
              body: "Explain the change you want to make. If you did not launch this from Edit this..., include the source file path in the request.",
              sections: ["context-summary", "available-context-keys", "capabilities"],
              capabilities: [
                "Open an existing project-local recipe or plugin module and keep the current shape intact.",
                "Draft the change without touching the source file until you approve it.",
                "Show a diff preview before saving the change back to the workspace.",
              ],
              responseInstructions:
                "Describe the change you want, any constraints to preserve, and any identifiers or structure that must stay stable.",
            },
          },
        },
        {
          kind: "tool",
          id: "read-current-view",
          toolName: "t3work.view.read",
        },
        {
          kind: "script",
          id: "prepare-edit-workspace",
          module: "./recipe-script.ts#prepareEditWorkspace",
        },
        {
          kind: "agent",
          id: "draft-edit",
          promptPath: "./draft-prompt.md",
        },
        {
          kind: "present-message",
          id: "review-edit",
          message: {
            body: "Review the proposed diff below. Approve it to write the change back to the source file.",
            visibleToAgent: false,
          },
        },
        {
          kind: "script",
          id: "present-edit-preview",
          module: "./recipe-script.ts#presentEditPreview",
        },
        {
          kind: "collect-input",
          id: "approve-edit",
          request: {
            kind: "card-action",
            actionId: "approve",
          },
        },
        {
          kind: "script",
          id: "save-edit",
          module: "./recipe-script.ts#saveApprovedEdit",
        },
      ],
    },
    icon: "pencil",
    appliesTo: {},
    requiredContext: [{ key: "project.summary", description: "Project overview" }],
    skillRef: { id: "recipe.edit" },
    outputPreference: "markdown",
    artifactKinds: ["decision-notes"],
    actionFamilies: ["delivery", "engineering"],
    rankHint: 17,
  }),
  createBundledRecipe({
    topic: "customize",
    id: "create-contextual-recipe",
    title: "Create a recipe for this view",
    manifestDisplayName: "Create a recipe for this view",
    shortDescription:
      "Draft a reusable quick action based on what is visible here, with optional setup fields or show/hide rules.",
    actionViewTemplate: CREATE_CONTEXTUAL_RECIPE_ACTION_VIEW,
    surfaces: DASHBOARD_AND_WORKITEM_SURFACES,
    promptTemplate:
      "Help me design a reusable t3work recipe for this view. Start by explaining, in plain language, what the user can see here and which signals the recipe can use. Then propose the recipe manifest, visibility rules, prompt, any pre-launch setup UI, and the files that should be created or updated.",
    kickoff: {
      version: 1,
      steps: [
        {
          kind: "collect-input",
          id: "collect-recipe-brief",
          request: {
            kind: "text",
            when: "missing-prompt",
            promptRequest: {
              title: "Describe the recipe you want",
              body: "A recipe is a reusable quick action for views like this. It can send a tailored prompt, ask a few setup questions before launch, or only appear when the right project or ticket signals are present.",
              sections: ["context-summary", "available-context-keys", "capabilities"],
              capabilities: [
                "Simple quick actions that send a tailored prompt.",
                "Recipes that only appear when this view matches certain signals.",
                "Optional setup fields before launch, like tone, scope, or priority.",
                "Multi-step flows or built-in UI actions when one prompt is not enough.",
              ],
              responseInstructions:
                "Reply with the shortcut you want to create: what it should help with, where it should appear, what should make it show up, and whether it needs a small setup step before launch.",
            },
          },
        },
        {
          kind: "agent",
          id: "author-recipe",
        },
      ],
    },
    icon: "sparkles",
    appliesTo: {},
    requiredContext: [{ key: "project.summary", description: "Project overview" }],
    skillRef: { id: "recipe.authoring" },
    outputPreference: "plan",
    artifactKinds: ["implementation-plan", "decision-notes"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 18,
  }),
  createBundledRecipe({
    topic: "quick-actions",
    id: "explain-selected-work",
    title: "Explain this simply",
    manifestDisplayName: "Explain this simply",
    shortDescription: "Summarize the selected work with user impact, checks, and open questions.",
    actionViewTemplate: EXPLAIN_SELECTED_WORK_ACTION_VIEW,
    surfaces: DASHBOARD_AND_WORKITEM_SURFACES,
    promptTemplate:
      "Explain {{selectedWorkLabel}} in plain language. Cover user impact, what is changing, what needs checking, and any unclear points.",
    icon: "sparkles",
    appliesTo: {},
    requiredContext: [{ key: "ticket.summary", description: "Selected work summary" }],
    skillRef: { id: "summary.explain" },
    outputPreference: "markdown",
    artifactKinds: ["summary", "open-questions"],
    actionFamilies: ["summary", "product"],
    rankHint: 16,
  }),
  createBundledRecipe({
    topic: "qa",
    id: "review-acceptance-criteria",
    title: "Review acceptance criteria",
    manifestDisplayName: "Review acceptance criteria",
    shortDescription: "Call out ambiguity, missing testability notes, and follow-up questions.",
    actionViewTemplate: REVIEW_ACCEPTANCE_CRITERIA_ACTION_VIEW,
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Review the acceptance criteria for {{selectedWorkLabel}}. Return a checklist, ambiguity warnings, missing testability notes, and the questions that should be resolved before implementation or QA.",
    icon: "clipboard-list",
    appliesTo: {
      resourceKinds: ["ticket"],
      technicalDepths: ["low", "medium", "high"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.pre-implementation",
        description: "Ticket is still before implementation or PR work starts",
      },
    ],
    skillRef: { id: "qa.acceptance-review" },
    outputPreference: "blocks",
    artifactKinds: ["acceptance-criteria", "open-questions"],
    actionFamilies: ["qa", "product", "engineering"],
    rankHint: 20,
  }),
  createBundledRecipe({
    topic: "qa",
    id: "create-qa-test-plan",
    title: "Create QA test plan",
    manifestDisplayName: "Create QA test plan",
    shortDescription: "Build a test matrix with regression, smoke, and edge-case coverage.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Create a QA test plan for {{selectedWorkLabel}}. Include a test matrix, environment assumptions, edge cases, regression versus smoke coverage, and explicit open questions.",
    icon: "bug",
    appliesTo: {
      resourceKinds: ["ticket"],
      requiredSkillPackIds: ["qa"],
      technicalDepths: ["low", "medium"],
      guidanceStyles: ["guided", "balanced"],
    },
    requiredContext: [{ key: "ticket.summary", description: "Ticket summary" }],
    skillRef: { id: "qa.test-plan" },
    outputPreference: "plan",
    artifactKinds: ["test-matrix", "risk-list", "checklist"],
    actionFamilies: ["qa", "verification"],
    rankHint: 26,
  }),
  createBundledRecipe({
    topic: "planning",
    id: "prioritize-pending-work",
    title: "Prioritize pending work",
    manifestDisplayName: "Prioritize pending work",
    shortDescription:
      "Rank the {{currentViewLabel}} in front of you by urgency, unblock value, and user impact.",
    actionViewTemplate: PRIORITIZE_PENDING_WORK_ACTION_VIEW,
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "Prioritize the {{currentViewLabel}} for {{projectTitle}}. Group what should happen now, next, and later. Explain urgency, user impact, dependencies, and which item would unlock the most progress.",
    icon: "list-todo",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.focused",
        description: "Visible dashboard slice is small enough to rank concretely",
      },
    ],
    skillRef: { id: "delivery.prioritize-pending-work" },
    outputPreference: "plan",
    artifactKinds: ["priority-list", "next-step"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 26,
  }),
  createBundledRecipe({
    topic: "filters",
    id: "focus-needs-my-action",
    title: "Show what needs my action",
    manifestDisplayName: "Show what needs my action",
    shortDescription:
      "Filter the current view to the work most likely waiting on you, then rank the next move.",
    actionViewTemplate: FOCUS_NEEDS_MY_ACTION_ACTION_VIEW,
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "I just filtered the {{currentViewLabel}} for {{projectTitle}} down to the work most likely to need my action. From this filtered slice, identify what is truly waiting on me, rank it by leverage and urgency, and give me the next concrete move.",
    icon: "list-filter",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.too-broad",
        description:
          "Visible dashboard slice is broad enough that it should be narrowed before deeper prioritization",
      },
      {
        key: "dashboard.view.needs-my-action",
        description:
          "Visible dashboard slice exposes a deterministic needs-my-action narrowing the recipe can apply before ranking the next move",
      },
    ],
    skillRef: { id: "delivery.focus-needs-my-action" },
    outputPreference: "plan",
    artifactKinds: ["priority-list", "next-step"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 34,
  }),
  // Assigned-to-me mirrors backlog filter-bar behavior; keep in sidecar for now but
  // candidates to move to filter chips once chip UX is validated (see MVP doc §Filters).
  createBundledRecipe({
    topic: "filters",
    id: "show-only-assigned-to-me",
    title: "Show only assigned to me",
    manifestDisplayName: "Show only assigned to me",
    shortDescription: "Apply the current-user assignee filter inline without opening chat.",
    actionViewTemplate: SHOW_ONLY_ASSIGNED_TO_ME_ACTION_VIEW,
    surfaces: BACKLOG_DASHBOARD_SURFACE,
    kickoff: {
      version: 1,
      steps: [
        {
          kind: "tool",
          id: "apply-assignee-filter",
          toolName: "t3work.backlog.set_assignee_filter",
          input: {
            mode: "current-user",
          },
        },
      ],
    },
    icon: "list-filter",
    allowedToolGroups: ["view.state"],
    appliesTo: {},
    requiredContext: [{ key: "project.summary", description: "Project overview" }],
    outputPreference: "plan",
    artifactKinds: ["next-step"],
    actionFamilies: ["delivery"],
    rankHint: 33,
  }),
  createBundledRecipe({
    topic: "filters",
    id: "clear-filters",
    title: "Clear filters",
    manifestDisplayName: "Clear filters",
    shortDescription: "Reset active view filters to the default slice.",
    actionViewTemplate: CLEAR_FILTERS_ACTION_VIEW,
    surfaces: DASHBOARD_SURFACES,
    icon: "list-filter",
    allowedToolGroups: ["view.state"],
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.filtered",
        description: "Active view filters can be cleared",
      },
    ],
    outputPreference: "plan",
    artifactKinds: ["next-step"],
    actionFamilies: ["delivery"],
    rankHint: 35,
  }),
  createBundledRecipe({
    topic: "refinement",
    id: "shape-next-backlog-slice",
    title: "Shape the next backlog slice",
    manifestDisplayName: "Shape the next backlog slice",
    shortDescription:
      "Pick the next 1-3 backlog items to pull forward and explain why they beat the rest.",
    actionViewTemplate: SHAPE_NEXT_BACKLOG_SLICE_ACTION_VIEW,
    surfaces: BACKLOG_DASHBOARD_SURFACE,
    promptTemplate:
      "Using the visible backlog context for {{projectTitle}}, choose the next 1-3 items to pull forward now. Explain why they should come next, what they unblock, what should wait, and the one risk or dependency to resolve first.",
    icon: "list-filter",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      { key: "dashboard.backlog.summary", description: "Visible backlog summary" },
      {
        key: "dashboard.view.focused",
        description:
          "Visible backlog slice is small enough to shape the next pull-forward decision",
      },
    ],
    skillRef: { id: "delivery.shape-backlog-slice" },
    outputPreference: "plan",
    artifactKinds: ["priority-list", "decision-notes"],
    actionFamilies: ["delivery", "product", "engineering"],
    rankHint: 30,
  }),
  createBundledRecipe({
    topic: "engineering",
    id: "technical-implementation-plan",
    title: "Draft implementation plan",
    manifestDisplayName: "Draft implementation plan",
    shortDescription: "Map impacted areas, sequencing, risks, and verification for implementation.",
    actionViewTemplate: TECHNICAL_IMPLEMENTATION_PLAN_ACTION_VIEW,
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Draft a concrete implementation plan for {{selectedWorkLabel}}. Include likely impacted areas, rollout order, failure modes, validation steps, and anything that should be clarified before coding.",
    icon: "code-2",
    appliesTo: {
      resourceKinds: ["ticket"],
      requiredSkillPackIds: ["engineering"],
      technicalDepths: ["high"],
      guidanceStyles: ["expert", "balanced"],
      detailDensities: ["balanced", "expert"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.pre-implementation",
        description: "Ticket is still before implementation or PR work starts",
      },
    ],
    skillRef: { id: "engineering.implementation-plan" },
    outputPreference: "plan",
    artifactKinds: ["implementation-plan", "technical-checklist", "verification-plan"],
    actionFamilies: ["engineering"],
    rankHint: 28,
  }),
  createBundledRecipe({
    topic: "delivery",
    id: "unblock-blocked-ticket",
    title: "Unblock this item",
    manifestDisplayName: "Unblock this item",
    shortDescription: "Pick the next move that will reopen progress.",
    composerGuidance: {
      helperText: "Add any context that could change the recommendation.",
      placeholder: "Add owner, attempts, deadline, or fallback",
    },
    actionViewTemplate: UNBLOCK_BLOCKED_TICKET_ACTION_VIEW,
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Analyze the blockers and dependencies around {{selectedWorkLabel}}. Identify the single next move that would reopen progress fastest, name who or what owns the blocker, explain the evidence behind that recommendation, and give a fallback path if the blocker cannot be cleared today.",
    icon: "link-2-off",
    appliesTo: {
      resourceKinds: ["ticket"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.blocked",
        description: "Ticket is blocked by linked work or an explicitly blocked status",
      },
    ],
    skillRef: { id: "delivery.unblock-blocked-ticket" },
    outputPreference: "plan",
    artifactKinds: ["next-step", "blocker-list", "decision-notes"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 31,
  }),
  createBundledRecipe({
    topic: "refinement",
    id: "tshirt-size-epic",
    title: "T-shirt-size this epic",
    manifestDisplayName: "T-shirt-size this epic",
    shortDescription:
      "Estimate the epic effort as XS/S/M/L/XL with rationale, confidence, and the main risk drivers.",
    actionViewTemplate: TSHIRT_SIZE_EPIC_ACTION_VIEW,
    surfaces: ["workitem.detail.sidepanel", "project.dashboard.backlog"],
    promptTemplate:
      "T-shirt-size the epic {{selectedWorkLabel}} as a multi-source estimate. First confirm the selected epic/story details (key, title, status, owner, acceptance criteria, and any existing children). Then inspect all available evidence before sizing: child stories/subtasks, linked or precedent stories and epics, attached Jira context, related GitHub/PR activity, and the current codebase implementation state where the workspace or linked repositories are available. Produce one size (XS, S, M, L, or XL) with confidence (low/medium/high), an evidence table grouped by Jira scope, code/implementation status, precedent comparisons, and unknowns, plus the main risk drivers that could move the size up. Call out missing acceptance criteria or data you could not inspect. If the epic has no stories or subtasks yet, recommend running the shape-next-backlog-slice recipe to decompose it before implementation. Persist the estimate as a durable estimation-notes artifact.",
    icon: "ruler",
    appliesTo: {
      jiraIssueTypes: ["Epic"],
      // Prefer epics with no child stories yet; unknown child signals wait for enrichment.
      visiblePredicates: recipeSignalPredicates.workitemHasNoChildren,
    },
    requiredContext: [
      { key: "ticket.summary", description: "Epic summary" },
      {
        key: "ticket.relationship.children",
        description: "Child stories, subtasks, or decomposition status",
        optional: true,
      },
      {
        key: "ticket.relationship.linked",
        description: "Related or precedent Jira work",
        optional: true,
      },
      {
        key: "ticket.github.pull-request",
        description: "Linked GitHub/PR implementation evidence",
        optional: true,
      },
      {
        key: "ticket.context.pre-implementation",
        description: "Epic is still before implementation or PR work starts",
        optional: true,
      },
    ],
    skillRef: { id: "delivery.tshirt-size-epic" },
    outputPreference: "comment",
    artifactKinds: ["estimation-notes", "open-questions"],
    actionFamilies: ["delivery", "product", "engineering"],
    rankHint: 22,
    suggestedActions: [
      {
        id: "shape-next-backlog-slice",
        label: "Shape the next backlog slice",
        recipeId: "shape-next-backlog-slice",
      },
    ],
  }),
] as const;

export function listBundledT3WorkRecipes(): ReadonlyArray<BundledT3WorkRecipe> {
  return BUNDLED_RECIPES;
}

export function getBundledT3WorkRecipe(recipeId: string): BundledT3WorkRecipe | undefined {
  return BUNDLED_RECIPES.find((recipe) => recipe.id === recipeId);
}
