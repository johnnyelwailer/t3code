import { describe, expect, it, vi } from "vitest";

import { launchPendingRecipeWorkflowTurn } from "~/t3work/chat/t3work-recipeWorkflowLaunch";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

function createBackend(): Pick<BackendApi, "launchRecipeWorkflow"> {
  return {
    launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
  };
}

const TEST_WORKFLOW: T3workKickoffWorkflow = {
  kind: "recipe",
  recipeId: "create-contextual-recipe",
  recipeVersion: "0.1.0",
  kickoff: {
    version: 1,
    steps: [
      {
        kind: "wait-for-kickoff-input",
        id: "collect-brief",
        when: "missing-prompt",
        promptRequest: {
          title: "Recipe authoring kickoff",
        },
      },
      {
        kind: "run-interactive-agent",
        id: "author",
      },
    ],
  },
  title: "Create a recipe for this context",
  description: "Design a contextual recipe for the current surface.",
  source: "bundled",
  surface: "project.dashboard",
};

describe("launchPendingRecipeWorkflowTurn", () => {
  it("launches the recipe workflow when a pending kickoff receives its first manual prompt", async () => {
    const backend = createBackend();

    await expect(
      launchPendingRecipeWorkflowTurn({
        backend: backend as BackendApi,
        threadId: "thread-1",
        kickoffPending: false,
        kickoffWorkflow: TEST_WORKFLOW,
        hasServerLaunchActivity: false,
        kickoffMessage: "Build me a recipe for backlog risk hotspots.",
        titleSeed: "Create a recipe for this context",
        createdAt: "2026-05-27T18:00:00.000Z",
        modelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        hasAttachments: false,
      }),
    ).resolves.toBe(true);

    expect(backend.launchRecipeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        kickoffMessage: "Build me a recipe for backlog risk hotspots.",
        launch: expect.objectContaining({
          recipeId: "create-contextual-recipe",
          kickoff: TEST_WORKFLOW.kickoff,
        }),
      }),
    );
  });

  it("falls back when attachments are present because the launch route is still text-only", async () => {
    const backend = createBackend();

    await expect(
      launchPendingRecipeWorkflowTurn({
        backend: backend as BackendApi,
        threadId: "thread-1",
        kickoffPending: false,
        kickoffWorkflow: TEST_WORKFLOW,
        hasServerLaunchActivity: false,
        kickoffMessage: "Build me a recipe for backlog risk hotspots.",
        titleSeed: "Create a recipe for this context",
        createdAt: "2026-05-27T18:00:00.000Z",
        modelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        hasAttachments: true,
      }),
    ).resolves.toBe(false);

    expect(backend.launchRecipeWorkflow).not.toHaveBeenCalled();
  });
});
