// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ProjectShellProject } from "@t3tools/project-context";
import type { ManagedProjectRecipe } from "@t3tools/project-recipes";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { BackendProvider, createMockBackend, type BackendApi } from "~/t3work/backend/t3work-index";
import { ProjectRecipeManagerPage } from "~/t3work/t3work-ProjectRecipeManagerPage";

const project = {
  id: "project-alpha",
  title: "Project Alpha",
  source: { provider: "local" },
  workspace: { rootPath: "/workspace/project-alpha" },
} as ProjectShellProject;

const recipe: ManagedProjectRecipe = {
  id: "release-checklist",
  version: "1.0.0",
  displayName: "Release checklist",
  shortDescription: "Prepare a release checklist.",
  surfaces: ["project.dashboard.backlog"],
  active: true,
  sourceKind: "recipe-json",
  editable: true,
  deletable: true,
  recipePath: "/workspace/project-alpha/.t3work/recipes/release-checklist",
  sourcePath: "/workspace/project-alpha/.t3work/recipes/release-checklist/recipe.json",
  promptPath: "/workspace/project-alpha/.t3work/recipes/release-checklist/prompt.md",
  prompt: "Build a release checklist.",
};

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  vi.restoreAllMocks();
});

function getButton(host: HTMLElement, label: string) {
  const match = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(label),
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

async function renderPage(backend: BackendApi, onEditRecipeWithChat = vi.fn()) {
  const host = document.createElement("div");
  const root = createRoot(host);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <BackendProvider backend={backend}>
        <ProjectRecipeManagerPage
          project={project}
          onBack={() => {}}
          onEditRecipeWithChat={onEditRecipeWithChat}
        />
      </BackendProvider>,
    );
  });
  await act(async () => {});
  return { host, onEditRecipeWithChat };
}

describe("ProjectRecipeManagerPage", () => {
  it("renders as a full page with explicit chat editing", async () => {
    const baseBackend = createMockBackend();
    const backend: BackendApi = {
      ...baseBackend,
      projectWorkspace: {
        ...baseBackend.projectWorkspace,
        listManagedRecipes: async () => ({
          workspaceRoot: project.workspace!.rootPath,
          hasProjectLocalRecipes: true,
          recipes: [recipe],
        }),
      },
    };
    const { host, onEditRecipeWithChat } = await renderPage(backend);

    expect(host.textContent).toContain("Manage recipes");
    expect(host.textContent).toContain("Project Alpha");
    expect(host.textContent).toContain("Edit with chat");
    expect(host.textContent).not.toContain("Drag a recipe into chat");

    await act(async () => getButton(host, "Edit with chat").click());
    expect(onEditRecipeWithChat).toHaveBeenCalledWith(recipe);
  });

  it("keeps destructive and activation actions available", async () => {
    const baseBackend = createMockBackend();
    const updateManagedRecipe = vi.fn(async () => ({
      workspaceRoot: project.workspace!.rootPath,
      recipe,
    }));
    const deleteManagedRecipe = vi.fn(async () => ({
      workspaceRoot: project.workspace!.rootPath,
      deletedRecipePath: recipe.recipePath,
    }));
    const backend: BackendApi = {
      ...baseBackend,
      projectWorkspace: {
        ...baseBackend.projectWorkspace,
        listManagedRecipes: async () => ({
          workspaceRoot: project.workspace!.rootPath,
          hasProjectLocalRecipes: true,
          recipes: [recipe],
        }),
        updateManagedRecipe,
        deleteManagedRecipe,
      },
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { host } = await renderPage(backend);

    await act(async () => getButton(host, "Save recipe").click());
    expect(updateManagedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipePath: recipe.recipePath, displayName: recipe.displayName }),
    );

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Deactivate recipe"]')?.click(),
    );
    expect(updateManagedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipePath: recipe.recipePath, active: false }),
    );

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Delete recipe"]')?.click(),
    );
    expect(deleteManagedRecipe).toHaveBeenCalledWith(
      expect.objectContaining({ recipePath: recipe.recipePath }),
    );
  });
});
