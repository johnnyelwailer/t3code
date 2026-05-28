import type { Recipe } from "@t3tools/project-recipes";

import {
  CREATE_CONTEXTUAL_RECIPE_ACTION_VIEW,
  EXPLAIN_SELECTED_WORK_ACTION_VIEW,
  FOCUS_NEEDS_MY_ACTION_ACTION_VIEW,
  PRIORITIZE_PENDING_WORK_ACTION_VIEW,
  REVIEW_ACCEPTANCE_CRITERIA_ACTION_VIEW,
  SHAPE_NEXT_BACKLOG_SLICE_ACTION_VIEW,
  SUMMARIZE_PROJECT_RISK_ACTION_VIEW,
  TECHNICAL_IMPLEMENTATION_PLAN_ACTION_VIEW,
  UNBLOCK_BLOCKED_TICKET_ACTION_VIEW,
  UNBLOCK_MY_WORK_ACTION_VIEW,
} from "./recipeActionViews.ts";

export type BundledT3WorkRecipe = Recipe & {
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
const MY_WORK_DASHBOARD_SURFACE = ["project.dashboard.myWork"] as const;

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
    id: "create-contextual-recipe",
    title: "Create a recipe for this view",
    manifestDisplayName: "Create a recipe for {{surfaceAuthoringLabel}}",
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
    id: "explain-selected-work",
    title: "Explain this simply",
    manifestDisplayName: "Explain {{selectedWorkLabel}}",
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
    id: "review-acceptance-criteria",
    title: "Review acceptance criteria",
    manifestDisplayName: "Review acceptance criteria for {{selectedWorkLabel}}",
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
    id: "create-qa-test-plan",
    title: "Create QA test plan",
    manifestDisplayName: "Create QA plan for {{selectedWorkLabel}}",
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
    id: "summarize-project-risk",
    title: "Summarize project risk",
    manifestDisplayName: "Summarize project risk",
    shortDescription: "Highlight blockers, unclear work, and the next high-leverage actions.",
    actionViewTemplate: SUMMARIZE_PROJECT_RISK_ACTION_VIEW,
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "Summarize risk for {{projectTitle}}. Group it into blockers, unclear work, dependency risks, and the next actions that would reduce risk fastest.",
    icon: "triangle-alert",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.risk-hotspot",
        description:
          "Visible dashboard slice is small enough to scan and concentrated enough to indicate clear delivery risk",
      },
    ],
    skillRef: { id: "delivery.project-risk" },
    outputPreference: "blocks",
    artifactKinds: ["risk-board", "blocker-list"],
    actionFamilies: ["delivery", "qa", "release"],
    rankHint: 22,
  }),
  createBundledRecipe({
    id: "next-best-task",
    title: "Suggest next best task",
    manifestDisplayName: "Suggest next best task",
    shortDescription: "Recommend the highest-leverage next task based on current project context.",
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "Based on the current context for {{projectTitle}}, recommend the next highest-leverage task to do now. Explain why it should come next, what it depends on, and what could block it.",
    icon: "arrow-right",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.focused",
        description: "Visible dashboard slice is small enough to recommend a concrete next move",
      },
    ],
    skillRef: { id: "delivery.next-task" },
    outputPreference: "plan",
    artifactKinds: ["priority-list", "next-step"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 12,
  }),
  createBundledRecipe({
    id: "prioritize-pending-work",
    title: "Prioritize pending work",
    manifestDisplayName: "Prioritize {{currentViewLabel}}{{currentViewSummarySuffix}}",
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
  createBundledRecipe({
    id: "shape-next-backlog-slice",
    title: "Shape the next backlog slice",
    manifestDisplayName: "Shape the next backlog slice{{currentViewSummarySuffix}}",
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
    id: "unblock-my-work",
    title: "Unblock my work",
    manifestDisplayName: "Unblock my work{{currentViewSummarySuffix}}",
    shortDescription:
      "Find the single unblock, clarification, or handoff that will move your current work fastest.",
    actionViewTemplate: UNBLOCK_MY_WORK_ACTION_VIEW,
    surfaces: MY_WORK_DASHBOARD_SURFACE,
    promptTemplate:
      "Using the visible my work context for {{projectTitle}}, identify the single highest-leverage unblock to make next. Call out the blocked item, what evidence supports that choice, who or what is needed, and the exact next action to take.",
    icon: "arrow-up-right",
    appliesTo: {},
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      { key: "dashboard.my-work.summary", description: "Visible my work summary" },
      {
        key: "dashboard.view.focused",
        description: "Visible my work slice is small enough to identify one concrete unblock",
      },
    ],
    skillRef: { id: "delivery.unblock-my-work" },
    outputPreference: "plan",
    artifactKinds: ["next-step", "blocker-list"],
    actionFamilies: ["delivery", "engineering"],
    rankHint: 30,
  }),
  createBundledRecipe({
    id: "stakeholder-update",
    title: "Draft stakeholder update",
    manifestDisplayName: "Draft stakeholder update",
    shortDescription: "Turn current status into a low-jargon update for stakeholders or customers.",
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "Draft a stakeholder update for {{projectTitle}}. Lead with what changed, why it matters, current risk, and the decisions or follow-ups that need attention. Keep jargon low.",
    icon: "newspaper",
    appliesTo: {
      technicalDepths: ["low", "medium"],
      brevities: ["short", "balanced"],
      requiredSkillPackIds: ["product", "support"],
    },
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.risk-hotspot",
        description:
          "Visible dashboard slice exposes a focused risk cluster worth communicating outward",
      },
    ],
    skillRef: { id: "product.stakeholder-update" },
    outputPreference: "markdown",
    artifactKinds: ["status-update", "decision-notes"],
    actionFamilies: ["product", "support"],
    rankHint: 24,
  }),
  createBundledRecipe({
    id: "draft-status-update",
    title: "Draft status update",
    manifestDisplayName: "Draft status update",
    shortDescription: "Prepare a concise status, blocker, and next-step update for the team.",
    surfaces: DASHBOARD_SURFACES,
    promptTemplate:
      "Draft a concise status update for {{projectTitle}}. Include done, in progress, blocked, next, and the single most important dependency or risk to watch.",
    icon: "clipboard-check",
    appliesTo: {
      technicalDepths: ["low", "medium"],
      requiredSkillPackIds: ["delivery"],
    },
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      {
        key: "dashboard.view.focused",
        description:
          "Visible dashboard slice is focused enough to summarize status and the next move concretely",
      },
    ],
    skillRef: { id: "delivery.status-update" },
    outputPreference: "comment",
    artifactKinds: ["status-update", "blocker-list"],
    actionFamilies: ["delivery", "release"],
    rankHint: 16,
  }),
  createBundledRecipe({
    id: "technical-implementation-plan",
    title: "Draft implementation plan",
    manifestDisplayName: "Draft implementation plan for {{selectedWorkLabel}}",
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
    id: "address-linked-pr-feedback",
    title: "Address linked PR feedback",
    manifestDisplayName: "Address linked PR feedback for {{selectedWorkLabel}}",
    shortDescription:
      "Turn the open review requests and comments on linked PRs into the next safest code changes.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Review the linked GitHub PR activity for {{selectedWorkLabel}}. Summarize the open review requests and comments, separate must-fix issues from optional feedback, propose the smallest safe change order, and call out anything that still needs clarification before replying or pushing updates.",
    icon: "git-pull-request-arrow",
    appliesTo: {
      resourceKinds: ["ticket"],
      requiredSkillPackIds: ["engineering"],
      technicalDepths: ["medium", "high"],
      guidanceStyles: ["balanced", "expert"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.review-needs-response",
        description:
          "Linked pull requests have review requests or comment activity that needs a response",
      },
    ],
    skillRef: { id: "engineering.address-linked-pr-feedback" },
    outputPreference: "plan",
    artifactKinds: ["implementation-plan", "verification-plan", "open-questions"],
    actionFamilies: ["engineering", "verification"],
    rankHint: 32,
  }),
  createBundledRecipe({
    id: "unblock-blocked-ticket",
    title: "Unblock blocked ticket",
    manifestDisplayName: "Unblock {{selectedWorkLabel}}",
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
    id: "re-scope-ticket-overrun",
    title: "Re-scope overrun ticket",
    manifestDisplayName: "Re-scope {{selectedWorkLabel}}",
    shortDescription:
      "Compare the remaining time to the original estimate and decide whether to split, defer, or finish as-is.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "{{selectedWorkLabel}} now has {{ticketRemainingEstimateHours}} remaining against an original {{ticketOriginalEstimateHours}} estimate. Decide whether the right move is to split scope, defer follow-up work, or finish as-is. Explain the tradeoff, the recommended next step, and what should be communicated back to the team.",
    icon: "clock-3",
    appliesTo: {
      resourceKinds: ["ticket"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.overrun",
        description: "Remaining estimate is above the original estimate",
      },
    ],
    skillRef: { id: "delivery.re-scope-ticket-overrun" },
    outputPreference: "plan",
    artifactKinds: ["decision-notes", "next-step", "priority-list"],
    actionFamilies: ["delivery", "engineering", "product"],
    rankHint: 30,
  }),
  createBundledRecipe({
    id: "release-handoff-checklist",
    title: "Prepare release handoff",
    manifestDisplayName: "Prepare release handoff for {{selectedWorkLabel}}",
    shortDescription: "Summarize what changed, what to verify, and what could block rollout.",
    surfaces: DASHBOARD_AND_WORKITEM_SURFACES,
    promptTemplate:
      "Prepare a release or QA handoff for {{selectedWorkLabel}}. Cover what changed, what to verify, rollout or deployment cues, blockers, and ownership for the next step.",
    icon: "ship",
    appliesTo: {
      requiredSkillPackIds: ["release"],
      technicalDepths: ["low", "medium", "high"],
    },
    requiredContext: [
      { key: "project.summary", description: "Project overview" },
      { key: "ticket.summary", description: "Selected work summary" },
      {
        key: "ticket.context.closeout-ready",
        description: "Linked implementation is merged but the ticket is not done yet",
      },
    ],
    skillRef: { id: "release.handoff" },
    outputPreference: "plan",
    artifactKinds: ["checklist", "handoff-note", "verification-plan"],
    actionFamilies: ["release", "delivery", "verification"],
    rankHint: 26,
  }),
  createBundledRecipe({
    id: "prepare-post-merge-closeout",
    title: "Prepare post-merge closeout",
    manifestDisplayName: "Close out {{selectedWorkLabel}} after merge",
    shortDescription:
      "Map the Jira, QA, and communication steps still needed now that linked code is merged.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "The linked implementation for {{selectedWorkLabel}} is already merged. Prepare the remaining closeout work: Jira status updates, QA or verification steps, communication or handoff notes, and the single thing most likely to keep the ticket open longer than necessary.",
    icon: "git-merge",
    appliesTo: {
      resourceKinds: ["ticket"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.closeout-ready",
        description: "Linked implementation is merged but the ticket is not done yet",
      },
    ],
    skillRef: { id: "delivery.prepare-post-merge-closeout" },
    outputPreference: "plan",
    artifactKinds: ["checklist", "handoff-note", "timeline"],
    actionFamilies: ["release", "delivery", "verification"],
    rankHint: 30,
  }),
  createBundledRecipe({
    id: "support-escalation-summary",
    title: "Create escalation summary",
    manifestDisplayName: "Create escalation summary for {{selectedWorkLabel}}",
    shortDescription:
      "Summarize customer impact, reproduction details, and the best escalation path.",
    surfaces: ["workitem.detail.sidepanel"],
    promptTemplate:
      "Create a support escalation summary for {{selectedWorkLabel}}. Include customer impact, severity, current evidence, reproduction gaps, and the exact follow-up needed from engineering or product.",
    icon: "life-buoy",
    appliesTo: {
      resourceKinds: ["ticket"],
      requiredSkillPackIds: ["support"],
      technicalDepths: ["low", "medium"],
    },
    requiredContext: [
      { key: "ticket.summary", description: "Ticket summary" },
      {
        key: "ticket.context.customer-risk",
        description: "Ticket is a customer-facing bug or a high-priority issue",
      },
    ],
    skillRef: { id: "support.escalation-summary" },
    outputPreference: "comment",
    artifactKinds: ["escalation-summary", "impact-summary"],
    actionFamilies: ["support"],
    rankHint: 24,
  }),
] as const;

export function listBundledT3WorkRecipes(): ReadonlyArray<BundledT3WorkRecipe> {
  return BUNDLED_RECIPES;
}

export function getBundledT3WorkRecipe(recipeId: string): BundledT3WorkRecipe | undefined {
  return BUNDLED_RECIPES.find((recipe) => recipe.id === recipeId);
}
