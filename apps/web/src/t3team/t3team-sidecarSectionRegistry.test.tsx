import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildSidecarSectionHost } from "./t3team-sidecarSectionHost";
import { getT3TeamSidecarSectionComponent } from "./t3team-sidecarSectionRegistry";

const { mockUseQuickStarts } = vi.hoisted(() => ({
  mockUseQuickStarts: vi.fn(),
}));

vi.mock("~/t3team/t3team-sidecarRecipes", () => ({
  useT3TeamSidecarRecipeQuickStarts: (input: unknown) => mockUseQuickStarts(input),
}));

vi.mock("~/t3team/t3team-KickoffRecipeList", () => ({
  T3TeamKickoffRecipeList: ({
    onSelectRecipe,
    recipes,
    selectedRecipeId,
  }: {
    onSelectRecipe: (recipe: (typeof recipes)[number], customization?: unknown) => void;
    recipes: readonly { id: string }[];
    selectedRecipeId?: string;
  }) => {
    if (recipes[0]) {
      onSelectRecipe(recipes[0], {
        selections: [{ name: "tone", label: "Tone", value: "focused" }],
      });
    }

    return <div>{`quick-starts:${selectedRecipeId ?? "none"}`}</div>;
  },
}));

const project: ProjectShellProject = {
  id: "project-1" as ProjectShellProject["id"],
  title: "Inbox Export Service",
  source: {
    provider: "local",
    externalProjectId: "project-1",
    raw: {},
  },
  workspace: {
    rootPath: "/tmp/project-1",
    createdAt: "2026-05-27T09:00:00.000Z",
  },
  createdAt: "2026-05-27T09:00:00.000Z",
  updatedAt: "2026-05-27T09:00:00.000Z",
};

describe("sidecar section registry", () => {
  it("renders quick starts via the registry and forwards selection into host.stageKickoff", () => {
    const quickStartsComponent = getT3TeamSidecarSectionComponent("quick-starts");
    const stageKickoff = vi.fn();

    mockUseQuickStarts.mockReturnValue([
      {
        id: "explain-selected-work",
        title: "Explain this simply",
        description: "Summarize the selected work.",
        prompt: "Explain this simply.",
        workflow: {
          kind: "recipe",
          recipeId: "explain-selected-work",
          title: "Explain this simply",
          description: "Summarize the selected work.",
          source: "bundled",
          surface: "project.dashboard.myWork",
        },
      },
    ]);

    const markup = renderToStaticMarkup(
      quickStartsComponent
        ? quickStartsComponent({
            host: buildSidecarSectionHost({
              placement: "sidecar.section",
              surface: "project.dashboard.myWork",
              projectId: "project-1",
              stageKickoff,
              launchRecipe: () => undefined,
              openThread: () => undefined,
            }),
            props: {
              recipeInput: {
                backend: null,
                surface: "project.dashboard",
                project,
                selectedWorkLabel: project.title,
                dashboardMode: "my-work",
              },
              selectedRecipeId: "explain-selected-work",
            },
          })
        : null,
    );

    expect(markup).toContain("quick-starts:explain-selected-work");
    expect(stageKickoff).toHaveBeenCalledWith(
      expect.objectContaining({ id: "explain-selected-work" }),
      expect.objectContaining({
        selections: [expect.objectContaining({ name: "tone", value: "focused" })],
      }),
    );
  });
});
