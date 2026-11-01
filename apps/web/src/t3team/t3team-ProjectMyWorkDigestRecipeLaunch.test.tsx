// @vitest-environment jsdom
import type { ProjectShellProject } from "@t3tools/project-context";
import { ProjectId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { T3TeamQuickStartsSection } from "~/t3team/t3team-QuickStartsSection";
import type { SidecarSectionHost } from "~/t3team/t3team-sidecarSectionHost";
import { DigestReviewSection } from "~/t3team/t3team-ProjectMyWorkDigestReviewSection";
import { buildProjectDashboardSelectedRecipe } from "~/t3team/t3team-dashboardRecipeSelection";
import { openDigestPullRequest, useDigestPrAsideStore } from "~/t3team/t3team-digestPrAsideStore";
import { DigestRecipeCatalogProvider } from "~/t3team/t3team-digestRecipeCatalog";
import {
  requestDigestRecipeLaunch,
  useDigestRecipeLaunchStore,
} from "~/t3team/t3team-digestRecipeLaunchStore";
import { digestReviewActions } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type {
  DigestGraph,
  DigestReviewRequest,
  DigestSection,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import { useRecipeDiscovery, type RecipeDiscoveryStatus } from "~/t3team/t3team-useRecipeDiscovery";
import { useBundledSidecarRecipeLaunch } from "~/t3team/t3team-useBundledSidecarRecipeLaunch";
import { useDigestRecipeLaunchConsumer } from "~/t3team/t3team-useDigestRecipeLaunchConsumer";

const { discovered, discoveryStatus, toastAdd } = vi.hoisted(() => ({
  discovered: { current: [] as T3TeamSidecarRecipeQuickStart[] },
  discoveryStatus: { current: "settled" as "pending" | "settled" | "failed" },
  toastAdd: vi.fn(),
}));

vi.mock("~/components/ui/toast", () => ({ toastManager: { add: toastAdd } }));

// The Quick Start list is a presentational seam here: one button that selects the first recipe.
vi.mock("~/t3team/t3team-KickoffRecipeList", () => ({
  T3TeamKickoffRecipeList: (props: {
    recipes: ReadonlyArray<{ id: string }>;
    onSelectRecipe: (recipe: unknown) => void;
  }) => (
    <button type="button" onClick={() => props.onSelectRecipe(props.recipes[0])}>
      pick
    </button>
  ),
}));

vi.mock("~/t3team/backend/t3team-index", () => ({ useBackend: () => null }));

// The discovery seam: what `discoverRecipes` returned for the PR-detail surface.
vi.mock("~/t3team/t3team-sidecarRecipes", () => ({
  useT3TeamSidecarRecipeDiscovery: (input: { surface: string }) => ({
    quickStarts: input.surface === "github.pull_request.detail.sidepanel" ? discovered.current : [],
    status: discoveryStatus.current,
  }),
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
  discoveryStatus.current = "settled";
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

describe("digest recipe request whose recipe is not listed", () => {
  const scope = digestReviewActions({
    id: "r1",
    projectId: "project-1",
    host: "ghe.example.com",
    repo: "hive/api",
    number: 12,
    title: "Add audit log",
    updatedAt: "2026-10-01T00:00:00.000Z",
  } as unknown as DigestReviewRequest)[0]!.scope!;

  beforeEach(() => {
    vi.useFakeTimers();
    toastAdd.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a valid request alive while discovery is pending, however long it takes", () => {
    discovered.current = [];
    discoveryStatus.current = "pending";
    render();
    act(() => requestDigestRecipeLaunch({ recipeId: "pr-review", scope }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(useDigestRecipeLaunchStore.getState().request).not.toBeNull();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it("stages the recipe without a toast when slow discovery then lists it", () => {
    discovered.current = [];
    discoveryStatus.current = "pending";
    render();
    act(() => requestDigestRecipeLaunch({ recipeId: "pr-review", scope }));
    act(() => void vi.advanceTimersByTime(60_000));
    discovered.current = [prReview];
    discoveryStatus.current = "settled";
    render();
    expect(latest.current?.selectedRecipe?.recipe.id).toBe("pr-review");
    expect(toastAdd).not.toHaveBeenCalled();
    expect(useDigestRecipeLaunchStore.getState().request).not.toBeNull();
  });

  it("settles the request and toasts once when discovery finished without the recipe", () => {
    discovered.current = [];
    discoveryStatus.current = "pending";
    render();
    act(() => requestDigestRecipeLaunch({ recipeId: "pr-review", scope }));
    discoveryStatus.current = "settled";
    render();
    render();
    expect(useDigestRecipeLaunchStore.getState().request).toBeNull();
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        description: 'The "pr-review" recipe is not available in this project.',
      }),
    );
  });

  it("says discovery failed, not that the recipe is missing, when discovery rejected", () => {
    discovered.current = [];
    discoveryStatus.current = "failed";
    render();
    act(() => requestDigestRecipeLaunch({ recipeId: "pr-review", scope }));
    expect(useDigestRecipeLaunchStore.getState().request).toBeNull();
    expect(toastAdd).toHaveBeenCalledTimes(1);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Recipes could not be loaded for this project." }),
    );
  });
});

const flush = () => act(async () => void (await Promise.resolve()));

describe("Quick Start card click", () => {
  function click(launchQuickStart: SidecarSectionHost["launchQuickStart"]) {
    const host = { launchQuickStart, launchRecipe: vi.fn(), openThread: vi.fn() };
    act(() =>
      root.render(
        <T3TeamQuickStartsSection
          host={host as unknown as SidecarSectionHost}
          props={{ recipeInput: { backend: null }, quickStarts: [prReview] }}
        />,
      ),
    );
    act(() => container.querySelector("button")?.click());
  }

  beforeEach(() => toastAdd.mockReset());

  it("shows the error toast when the launch rejects", async () => {
    click(() => Promise.reject(new Error("Could not reach the server.")));
    await flush();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", description: "Could not reach the server." }),
    );
  });

  it("shows no toast when the launch succeeds", async () => {
    click(() => Promise.resolve(true));
    await flush();
    expect(toastAdd).not.toHaveBeenCalled();
  });
});

describe("bundled recipe launch", () => {
  const onLaunched = vi.fn();
  let createThread: () => unknown;

  function Harness() {
    latest.current = useBundledSidecarRecipeLaunch({
      backend: {} as never,
      environmentId: "env-1",
      projectId: project.id,
      surface: "project.dashboard.myWork",
      projectWorkspaceRoot: undefined,
      openThread: () => undefined,
      buildSelectedRecipe: (recipe) => ({ recipe }),
      createThread,
      onLaunched,
    });
    return null;
  }

  beforeEach(() => {
    toastAdd.mockReset();
    onLaunched.mockReset();
    act(() => root.render(<Harness />));
  });

  it("toasts a failed launch and keeps the staged recipe so the user can retry", async () => {
    createThread = () => {
      throw new Error("Thread creation failed.");
    };
    act(() => root.render(<Harness />));
    act(() => latest.current?.stageRecipeKickoff(prReview));
    act(() => latest.current?.sidecarHost.launchRecipe("describe-rewrite"));
    await flush();
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", description: "Thread creation failed." }),
    );
    expect(onLaunched).not.toHaveBeenCalled();
    expect(latest.current?.selectedRecipe?.recipe.id).toBe("pr-review");
  });

  it("toasts a launch that resolves false (no conversation was created)", async () => {
    createThread = () => undefined;
    act(() => root.render(<Harness />));
    act(() => latest.current?.sidecarHost.launchRecipe("describe-rewrite"));
    await flush();
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });
});

describe("useRecipeDiscovery status", () => {
  type Request = Parameters<typeof useRecipeDiscovery>[0]["discoveryRequest"];
  const requestA = { context: { surface: "a" } } as unknown as Request;
  const requestB = { context: { surface: "b" } } as unknown as Request;
  // Stable like the memoized fallback the real caller passes; a fresh array would restart discovery.
  const NO_QUICK_STARTS: T3TeamSidecarRecipeQuickStart[] = [];
  let status: RecipeDiscoveryStatus | null = null;

  function Probe(props: { backend: never; request: Request }) {
    status = useRecipeDiscovery({
      backend: props.backend,
      discoveryRequest: props.request,
      fallbackQuickStarts: NO_QUICK_STARTS,
      limit: undefined,
    }).status;
    return null;
  }
  const backendWith = (discoverRecipes: () => Promise<unknown>) =>
    ({ projectWorkspace: { discoverRecipes } }) as never;

  it("is pending until discovery answers, then settled", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const backend = backendWith(() => new Promise((r) => (resolve = r)));
    act(() => root.render(<Probe backend={backend} request={requestA} />));
    expect(status).toBe("pending");
    await act(async () => resolve({ recipes: [] }));
    expect(status).toBe("settled");
  });

  it("is failed when discovery rejects, and pending again for a new request", async () => {
    const backend = backendWith(() => Promise.reject(new Error("offline")));
    act(() => root.render(<Probe backend={backend} request={requestA} />));
    await flush();
    expect(status).toBe("failed");
    act(() =>
      root.render(
        <Probe backend={backendWith(() => new Promise(() => undefined))} request={requestB} />,
      ),
    );
    expect(status).toBe("pending");
  });

  it("is settled when there is nothing to discover", () => {
    act(() => root.render(<Probe backend={null as never} request={null as never} />));
    expect(status).toBe("settled");
  });
});
