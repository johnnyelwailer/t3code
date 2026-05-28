import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  compileT3workRecipeActionView,
  T3workCompiledRecipeActionView,
} from "~/t3work/t3work-recipeActionView";
import { RecipeLaunchControlsProvider } from "~/t3work/t3work-recipeActionLaunchControls";

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
            surface: "project.dashboard",
            project: {
              title: "Inbox Export Service",
              provider: "atlassian",
            },
            linkedResources: [],
            artifacts: [],
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
            availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
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
});
