// @vitest-environment jsdom
import type { ProjectShellProject } from "@t3tools/project-context";
import { ProjectId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DigestReviewSection } from "~/t3team/t3team-ProjectMyWorkDigestReviewSection";
import { buildProjectDashboardSelectedRecipe } from "~/t3team/t3team-dashboardRecipeSelection";
import { openDigestPullRequest, useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import { DigestRecipeCatalogProvider } from "~/t3team/t3team-digestRecipeCatalog";
import { useDigestRecipeLaunchStore } from "~/t3team/t3team-digestRecipeLaunchStore";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import { useBundledSidecarRecipeLaunch } from "~/t3team/t3team-useBundledSidecarRecipeLaunch";
import { useDigestRecipeLaunchConsumer } from "~/t3team/t3team-useDigestRecipeLaunchConsumer";

const { discovered } = vi.hoisted(() => ({
  discovered: { current: [] as T3TeamSidecarRecipeQuickStart[] },
}));

vi.mock("~/t3team/backend/t3team-index", () => ({ useBackend: () => null }));

// The discovery seam: what `discoverRecipes` returned for the PR-detail surface.
vi.mock("~/t3team/t3team-sidecarRecipes", () => ({
  useT3TeamSidecarRecipeQuickStarts: (input: { surface: string }) =>
    input.surface === "github.pull_request.detail.sidepanel" ? discovered.current : [],
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const project: ProjectShellProject = {
  id: "project-1" as ProjectShellProject["id"],
  title: "Hive",
  source: { provider: "atlassian", externalProjectId: "HIVE", raw: {} },
  workspace: { rootPath: "/tmp/hive", createdAt: "2026-10-01T00:00:00.000Z" },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const prReview: T3TeamSidecarRecipeQuickStart = {
  id: "pr-review",
  title: "Review this PR",
  description: "Full code review",
  prompt: "Review the pull request.",
  workflow: {
    kind: "recipe",
    recipeId: "pr-review",
    title: "Review this PR",
    description: "Full code review",
    source: "pack",
    surface: "github.pull_request.detail.sidepanel",
    workflowPath: "/packs/nexplore-global/recipes/pr-review/workflow.ts",
  },
};

const graph = {
  reviewRequests: [
    {
      id: "r1",
      projectId: "project-1",
      host: "ghe.example.com",
      repo: "hive/api",
      number: 12,
      title: "Add audit log",
      updatedAt: "2026-10-01T00:00:00.000Z",
      workItemKey: "HIVE-3",
    },
  ],
} as unknown as DigestGraph;
const section = { id: "reviews", kind: "reviews", heading: "Reviews", reviewIds: ["r1"] };

const latest: { current: ReturnType<typeof useBundledSidecarRecipeLaunch> | null } = {
  current: null,
};

/** The dashboard kickoff aside's launch wiring, without its chrome. */
function KickoffComposerHarness() {
  const launch = useBundledSidecarRecipeLaunch({
    backend: null,
    environmentId: null,
    projectId: project.id,
    surface: "project.dashboard.myWork",
    projectWorkspaceRoot: "/tmp/hive",
    openThread: () => undefined,
    buildSelectedRecipe: (recipe, customization) =>
      buildProjectDashboardSelectedRecipe({
        recipe,
        ...(customization ? { customization } : {}),
        runDashboardRecipeAction: () => null,
      }),
    createThread: () => undefined,
    onLaunched: undefined,
  });
  useDigestRecipeLaunchConsumer({
    projectId: project.id,
    selectedRecipe: launch.selectedRecipe,
    stageRecipeKickoff: launch.stageRecipeKickoff,
  });
  latest.current = launch;
  return null;
}

let root: Root;
let container: HTMLDivElement;

function render(launchable = true) {
  act(() => {
    root.render(
      <DigestRecipeCatalogProvider project={project} launchable={launchable}>
        <DigestReviewSection
          section={section as unknown as DigestSection}
          graph={graph}
          nowMs={0}
        />
        <KickoffComposerHarness />
      </DigestRecipeCatalogProvider>,
    );
  });
}

function reviewButton(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Review with agent",
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  discovered.current = [prReview];
  latest.current = null;
  useDigestRecipeLaunchStore.setState({ request: null });
  useDigestPrAsideStore.setState({ pullRequest: null });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("digest review recipe pill", () => {
  it("stages the PR-review recipe in the kickoff composer, scoped to the clicked PR", () => {
    render();
    act(() =>
      openDigestPullRequest({
        projectId: ProjectId.make("project-1"),
        repository: "hive/api",
        number: 12,
      }),
    );
    act(() => reviewButton()?.click());

    const selected = latest.current?.selectedRecipe;
    expect(selected?.recipe.id).toBe("pr-review");
    expect(selected?.customization?.selections.map((s) => s.displayValue ?? s.value)).toEqual([
      "hive/api#12",
      "HIVE-3",
    ]);
    expect(selected?.recipe.prompt).toContain('Pull request: hive/api#12 "Add audit log"');
    const workflow = selected?.recipe.workflow;
    expect(workflow?.parameters).toEqual({
      pullRequest: "https://ghe.example.com/hive/api/pull/12",
      workItem: "HIVE-3",
    });
    expect(workflow?.workflowPath).toBe(prReview.workflow?.workflowPath);
    expect(workflow?.launchContext?.linkedResources.items).toContainEqual(
      expect.objectContaining({ kind: "github.pull-request", label: "hive/api#12" }),
    );
    // The aside gives up the PR it showed so the composer holding the staged recipe is visible.
    expect(useDigestPrAsideStore.getState().pullRequest).toBeNull();
  });

  it("settles the request once the staged recipe is cleared", () => {
    render();
    act(() => reviewButton()?.click());
    expect(useDigestRecipeLaunchStore.getState().request).not.toBeNull();
    act(() => latest.current?.clearSelectedRecipe());
    expect(useDigestRecipeLaunchStore.getState().request).toBeNull();
  });

  it("renders no pill when the recipe is not in the discovered catalog", () => {
    discovered.current = [];
    render();
    expect(reviewButton()).toBeUndefined();
  });

  it("renders no pill while the aside cannot show the kickoff composer", () => {
    render(false);
    expect(reviewButton()).toBeUndefined();
  });
});
