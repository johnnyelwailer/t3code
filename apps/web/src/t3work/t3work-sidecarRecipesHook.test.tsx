// @vitest-environment jsdom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { ProjectRecipeDiscovered } from "@t3tools/project-recipes";
import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vite-plus/test";

import { createMockBackend } from "~/t3work/backend/t3work-mockBackend";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import { useT3workSidecarRecipeQuickStarts } from "~/t3work/t3work-sidecarRecipes";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createProject(): ProjectShellProject {
  return {
    id: "project-alpha" as ProjectShellProject["id"],
    title: "Project Alpha",
    source: {
      provider: "atlassian",
      externalProjectId: "PA",
      raw: { agentSetup: { profileId: "product-partner" } },
    },
    workspace: {
      rootPath: "/tmp/project-alpha",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function createLocalRecipe(id: string): ProjectRecipeDiscovered {
  return {
    id,
    version: "0.1.0",
    source: "project-local",
    displayName: `Local ${id}`,
    shortDescription: `Run local ${id}.`,
    surfaces: ["project.dashboard.backlog"],
    rank: 90,
    prompt: `Prompt for ${id}`,
    promptPath: `/tmp/project-alpha/.t3work/recipes/${id}/prompt.md`,
    recipePath: `/tmp/project-alpha/.t3work/recipes/${id}`,
    workflowPath: `/tmp/project-alpha/.t3work/recipes/${id}/workflow.ts`,
    allowedToolGroups: [],
  };
}

function QuickStartProbe({
  backend,
  project,
  renderToken,
}: {
  backend: BackendApi;
  project: ProjectShellProject;
  renderToken: number;
}) {
  const quickStarts = useT3workSidecarRecipeQuickStarts({
    backend,
    surface: "project.dashboard",
    project: { ...project },
    profileId: "product-partner",
    selectedWorkLabel: project.title,
    dashboardMode: "backlog",
    currentViewSummary: {
      itemCount: 4,
      bugCount: 1,
      primaryBugLabel: "IES-1234",
    },
    availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
  });

  return (
    <div data-render-token={renderToken}>{quickStarts.map((recipe) => recipe.id).join(",")}</div>
  );
}

describe("useT3workSidecarRecipeQuickStarts", () => {
  it("keeps discovered local quick starts stable across equivalent rerenders", async () => {
    const baseBackend = createMockBackend();
    const project = createProject();
    const firstDiscovery =
      createDeferred<Awaited<ReturnType<BackendApi["projectWorkspace"]["discoverRecipes"]>>>();
    const discoverRecipes = vi.fn(() => firstDiscovery.promise);
    const backend: BackendApi = {
      ...baseBackend,
      projectWorkspace: {
        ...baseBackend.projectWorkspace,
        discoverRecipes,
      },
    };
    const mountedRoots: Root[] = [];
    const host = document.createElement("div");
    const root = createRoot(host);
    mountedRoots.push(root);

    await act(async () => {
      root.render(<QuickStartProbe backend={backend} project={project} renderToken={1} />);
    });

    firstDiscovery.resolve({
      workspaceRoot: project.workspace!.rootPath,
      hasProjectLocalRecipes: true,
      recipes: [createLocalRecipe("local-priority")],
    });
    await act(async () => {
      await firstDiscovery.promise;
    });

    expect(host.textContent).toContain("local-priority");

    await act(async () => {
      root.render(<QuickStartProbe backend={backend} project={project} renderToken={2} />);
    });

    expect(discoverRecipes).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("local-priority");

    await act(async () => {
      mountedRoots.pop()?.unmount();
    });
  });
});
