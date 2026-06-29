import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { createQueryable } from "@t3tools/project-context";
import { getBundledT3WorkRecipe } from "@t3tools/t3work-skill-packs";

import {
  compileT3workRecipeActionView,
  T3workCompiledRecipeActionView,
} from "~/t3work/t3work-recipeActionView";
import { T3workDashboardRecipeActionProvider } from "~/t3work/t3work-dashboardRecipeActions";
import { RecipeLaunchControlsProvider } from "~/t3work/t3work-recipeActionLaunchControls";

async function renderBundledRecipeActionView(input: {
  readonly recipeId: string;
  readonly context: Parameters<typeof T3workCompiledRecipeActionView>[0]["context"];
}) {
  const recipe = getBundledT3WorkRecipe(input.recipeId);
  if (!recipe?.actionViewTemplate) {
    throw new Error(`Expected bundled recipe action view template for ${input.recipeId}`);
  }

  const CompiledActionView = await compileT3workRecipeActionView(recipe.actionViewTemplate);

  return renderToStaticMarkup(
    <T3workDashboardRecipeActionProvider>
      <RecipeLaunchControlsProvider>
        <T3workCompiledRecipeActionView Component={CompiledActionView} context={input.context} />
      </RecipeLaunchControlsProvider>
    </T3workDashboardRecipeActionProvider>,
  );
}

describe("compileT3workRecipeActionView", () => {
  it("renders spec-style action.mdx with host-owned components and ctx props", async () => {
    const CompiledActionView = await compileT3workRecipeActionView(`
export default function Action({ ctx }) {
  return (
    <RecipeAction
      title={"Prioritize " + (ctx.surfaceState?.dashboardMode ?? "project")}
      subtitle={<Badge variant="outline">Current view</Badge>}
      icon="list-todo"
    >
      <LaunchOptionGroup
        name="priorityLens"
        label="Prioritize for"
        defaultValue="impact"
        options={[
          { value: "impact", label: "Impact", promptText: "Lead with user impact." },
          { value: "risk", label: "Risk", promptText: "Lead with risk burn-down." },
        ]}
      />
      <LaunchTextInput
        name="focusArea"
        label="Extra focus"
        placeholder="Optional subsystem"
        promptTemplate="Pay extra attention to {{value}}."
      />
      <FieldList
        items={[
          { label: "Items", value: String(ctx.surfaceState?.currentView?.itemCount ?? 0) },
          { label: "Bug", value: ctx.surfaceState?.currentView?.primaryBugLabel ?? "None" },
        ]}
      />
      <RiskPill level="high">High risk</RiskPill>
      <SourceLink label="Visible backlog" />
    </RecipeAction>
  );
}
`);

    const markup = renderToStaticMarkup(
      <RecipeLaunchControlsProvider>
        <T3workCompiledRecipeActionView
          Component={CompiledActionView}
          context={{
            surface: "project.dashboard.backlog",
            project: {
              title: "Inbox Export Service",
              provider: "atlassian",
            },
            linkedResources: createQueryable([]),
            artifacts: createQueryable([]),
            surfaceState: {
              dashboardMode: "backlog",
              hasContextAttachments: false,
              hasSelectedWork: false,
              currentView: {
                itemCount: 3,
                bugCount: 1,
                primaryBugLabel: "IES-1234",
              },
            },
            profile: {
              technicalDepth: "medium",
              brevity: "balanced",
              guidanceStyle: "guided",
              detailDensity: "balanced",
              preferredArtifactKinds: ["priority-list"],
              defaultActionFamilies: ["delivery"],
              defaultRecipeWeights: {},
            },
            enabledSkillPacks: ["delivery"],
            schema: {},
            availableContextKeys: createQueryable(["project.summary", "dashboard.backlog.summary"]),
          }}
        />
      </RecipeLaunchControlsProvider>,
    );

    expect(markup).toContain("Prioritize backlog");
    expect(markup).toContain("Current view");
    expect(markup).toContain("IES-1234");
    expect(markup).toContain("Visible backlog");
    expect(markup).toContain("High risk");
    expect(markup).toContain("Prioritize for");
    expect(markup).toContain("Extra focus");
  });

  it("renders JiraInlineIssue blocks used by ticket action views", async () => {
    const CompiledActionView = await compileT3workRecipeActionView(`
export default function Action() {
  return (
    <RecipeAction title="Unblock linked issue" icon="arrow-up-right">
      <JiraInlineIssue
        displayId="IES-9100"
        title="API team needs to restore webhook delivery"
        issueType="Bug"
        issueTypeIconUrl="https://jira.example.com/icons/bug.svg"
        status="Blocked"
      />
    </RecipeAction>
  );
}
`);

    const markup = renderToStaticMarkup(
      <RecipeLaunchControlsProvider>
        <T3workCompiledRecipeActionView
          Component={CompiledActionView}
          context={{
            surface: "workitem.detail.sidepanel",
            project: {
              title: "Inbox Export Service",
              provider: "atlassian",
            },
            linkedResources: createQueryable([]),
            artifacts: createQueryable([]),
            profile: {
              technicalDepth: "medium",
              brevity: "balanced",
              guidanceStyle: "guided",
              detailDensity: "balanced",
              preferredArtifactKinds: ["priority-list"],
              defaultActionFamilies: ["delivery"],
              defaultRecipeWeights: {},
            },
            enabledSkillPacks: ["delivery"],
            schema: {},
            availableContextKeys: createQueryable(["ticket.summary"]),
          }}
        />
      </RecipeLaunchControlsProvider>,
    );

    expect(markup).toContain("IES-9100");
    expect(markup).toContain("API team needs to restore webhook delivery");
    expect(markup).toContain("Blocked");
    expect(markup).toContain("Unblock linked issue");
    expect(markup).toContain("https://jira.example.com/icons/bug.svg");
    expect(markup).toContain("hover:border-border/50 hover:bg-accent/25");
  });

  it("renders the bundled recipe-authoring card with plain-language guidance", async () => {
    const markup = await renderBundledRecipeActionView({
      recipeId: "create-contextual-recipe",
      context: {
        surface: "project.dashboard.backlog",
        project: {
          title: "Inbox Export Service",
          provider: "atlassian",
        },
        linkedResources: createQueryable([]),
        artifacts: createQueryable([]),
        surfaceState: {
          dashboardMode: "backlog",
          hasContextAttachments: false,
          hasSelectedWork: false,
          currentView: {
            itemCount: 8,
            bugCount: 2,
            primaryBugLabel: "IES-1234",
          },
        },
        profile: {
          technicalDepth: "medium",
          brevity: "balanced",
          guidanceStyle: "guided",
          detailDensity: "balanced",
          preferredArtifactKinds: ["priority-list"],
          defaultActionFamilies: ["delivery"],
          defaultRecipeWeights: {},
        },
        enabledSkillPacks: ["delivery"],
        schema: {},
        availableContextKeys: createQueryable([
          "project.summary",
          "dashboard.backlog.summary",
          "dashboard.view.focused",
          "dashboard.view.risk-hotspot",
        ]),
      },
    });

    expect(markup).toContain("Create a recipe for this view");
    expect(markup).toContain(
      "Let the agent handle repeatable backlog work: triage risk, shape the next slice, or flag missing owners.",
    );
    expect(markup).not.toContain("Badge");
  });

  it("renders bundled recipe cards without redundant pill labels", async () => {
    const dashboardContext = {
      surface: "project.dashboard.myWork" as const,
      project: {
        title: "Inbox Export Service",
        provider: "atlassian" as const,
      },
      linkedResources: createQueryable([]),
      artifacts: createQueryable([]),
      surfaceState: {
        dashboardMode: "my-work" as const,
        hasContextAttachments: false,
        hasSelectedWork: false,
        currentView: {
          itemCount: 50,
          bugCount: 1,
          primaryBugLabel: "IES-1234",
          primaryItemLabel: "IES-1235",
        },
      },
      profile: {
        technicalDepth: "medium" as const,
        brevity: "balanced" as const,
        guidanceStyle: "guided" as const,
        detailDensity: "balanced" as const,
        preferredArtifactKinds: ["priority-list"],
        defaultActionFamilies: ["delivery"],
        defaultRecipeWeights: {},
      },
      enabledSkillPacks: ["delivery"],
      schema: {},
      availableContextKeys: createQueryable([
        "project.summary",
        "dashboard.my-work.summary",
        "dashboard.view.focused",
      ]),
    };

    const ticketContext = {
      surface: "workitem.detail.sidepanel" as const,
      project: {
        title: "Inbox Export Service",
        provider: "atlassian" as const,
      },
      linkedResources: createQueryable([]),
      artifacts: createQueryable([]),
      workitem: {
        id: "IES-9242",
        label: "IES-9242",
        title: "Stabilize webhook retries",
        type: "Bug",
        priority: "High",
      },
      profile: {
        technicalDepth: "medium" as const,
        brevity: "balanced" as const,
        guidanceStyle: "guided" as const,
        detailDensity: "balanced" as const,
        preferredArtifactKinds: ["priority-list"],
        defaultActionFamilies: ["delivery"],
        defaultRecipeWeights: {},
      },
      enabledSkillPacks: ["delivery"],
      schema: {},
      availableContextKeys: createQueryable(["project.summary", "ticket.summary"]),
    };

    const [
      riskMarkup,
      prioritizeMarkup,
      focusMarkup,
      assignedMarkup,
      backlogMarkup,
      unblockMarkup,
      explainMarkup,
      planMarkup,
    ] = await Promise.all([
      renderBundledRecipeActionView({
        recipeId: "summarize-project-risk",
        context: dashboardContext,
      }),
      renderBundledRecipeActionView({
        recipeId: "prioritize-pending-work",
        context: dashboardContext,
      }),
      renderBundledRecipeActionView({
        recipeId: "focus-needs-my-action",
        context: dashboardContext,
      }),
      renderBundledRecipeActionView({
        recipeId: "show-only-assigned-to-me",
        context: {
          ...dashboardContext,
          surface: "project.dashboard.backlog",
          surfaceState: {
            ...dashboardContext.surfaceState,
            dashboardMode: "backlog",
          },
        },
      }),
      renderBundledRecipeActionView({
        recipeId: "shape-next-backlog-slice",
        context: {
          ...dashboardContext,
          surface: "project.dashboard.backlog",
          surfaceState: {
            ...dashboardContext.surfaceState,
            dashboardMode: "backlog",
          },
          availableContextKeys: createQueryable([
            "project.summary",
            "dashboard.backlog.summary",
            "dashboard.view.focused",
          ]),
        },
      }),
      renderBundledRecipeActionView({
        recipeId: "unblock-my-work",
        context: dashboardContext,
      }),
      renderBundledRecipeActionView({
        recipeId: "explain-selected-work",
        context: ticketContext,
      }),
      renderBundledRecipeActionView({
        recipeId: "technical-implementation-plan",
        context: ticketContext,
      }),
    ]);

    expect(riskMarkup).toContain("Summarize project risk");
    expect(riskMarkup).toContain("Items");
    expect(riskMarkup).not.toContain("Risk scan");
    expect(riskMarkup).not.toContain("Bug-driven risk");

    expect(prioritizeMarkup).toContain("Prioritize");
    expect(prioritizeMarkup).toContain("Bugs");
    expect(prioritizeMarkup).not.toContain("Current view");
    expect(prioritizeMarkup).not.toContain("Bug-heavy queue");
    expect(prioritizeMarkup).not.toContain("Lead");
    expect(prioritizeMarkup).not.toContain("IES-1235");

    expect(focusMarkup).toContain("Show what needs my action");
    expect(focusMarkup).toContain("Visible items");
    expect(focusMarkup).not.toContain("My work");

    expect(assignedMarkup).toContain("Show only assigned to me");
    expect(assignedMarkup).toContain("Apply filter");

    expect(backlogMarkup).toContain("Shape the next backlog slice");
    expect(backlogMarkup).toContain("Bugs");
    expect(backlogMarkup).not.toContain("Lead bug first");
    expect(backlogMarkup).not.toContain("Lead");
    expect(backlogMarkup).not.toContain("IES-1235");

    expect(unblockMarkup).toContain("Unblock my work");
    expect(unblockMarkup).toContain("Items");
    expect(unblockMarkup).toContain("Bugs");
    expect(unblockMarkup).not.toContain("Current work");
    expect(unblockMarkup).not.toContain("Needs clarification");
    expect(unblockMarkup).not.toContain("Lead");
    expect(unblockMarkup).not.toContain("IES-1235");

    expect(explainMarkup).toContain("Explain simply");
    expect(explainMarkup).toContain("Explain for");
    expect(explainMarkup).not.toContain("High-priority work");

    expect(planMarkup).toContain("Draft implementation plan");
    expect(planMarkup).toContain("Depth");
    expect(planMarkup).not.toContain("High-impact change");
  });
});
