import { describe, expect, it, vi } from "vitest";

import { createDefaultProjectDashboardBacklogState } from "~/t3work/t3work-projectDashboardBacklogStateShared";
import { launchProjectDashboardBacklogInlineRecipe } from "~/t3work/t3work-inlineRecipeLaunch";

describe("launchProjectDashboardBacklogInlineRecipe", () => {
  it("launches the bundled deterministic backlog recipe and applies the returned view-state patch", async () => {
    const launchRecipeWorkflow = vi.fn(async () => ({
      ok: true,
      mode: "deterministic" as const,
      workflowRunId: "t3work:recipe-workflow:deterministic:test-run",
      effects: [
        {
          kind: "view-state-patch" as const,
          stepId: "apply-assignee-filter",
          toolName: "t3work.backlog.set_assignee_filter",
          statePatch: {
            assigneeFilter: "Pat Jones",
          },
          promptText: "The dashboard is now filtered to work assigned to Pat Jones.",
        },
      ],
      completionActivity: {
        title: "Show only assigned to me",
        description: "The dashboard is now filtered to work assigned to Pat Jones.",
        tone: "success" as const,
      },
    }));
    const setState = vi.fn();

    const outcome = await launchProjectDashboardBacklogInlineRecipe({
      backend: { launchRecipeWorkflow } as never,
      recipeId: "show-only-assigned-to-me",
      workspaceRoot: "/workspace/project-1",
      projectId: "project-1",
      projectTitle: "Project One",
      state: createDefaultProjectDashboardBacklogState(),
      currentUserDisplayName: "Pat Jones",
      setState,
    });

    expect(launchRecipeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "/workspace/project-1",
        launch: expect.objectContaining({
          recipeId: "show-only-assigned-to-me",
          kickoff: {
            version: 1,
            steps: [
              expect.objectContaining({
                kind: "tool",
                toolName: "t3work.backlog.set_assignee_filter",
                input: { mode: "current-user" },
              }),
            ],
          },
          allowedToolGroups: ["view.state"],
        }),
        toolContext: expect.objectContaining({
          tools: [
            expect.objectContaining({
              id: "t3work.backlog.set_assignee_filter",
            }),
          ],
          state: expect.objectContaining({
            backlog: expect.objectContaining({
              currentUserDisplayName: "Pat Jones",
            }),
          }),
        }),
      }),
    );

    expect(setState).toHaveBeenCalledTimes(1);
    const updater = setState.mock.calls[0]?.[0];
    expect(typeof updater).toBe("function");
    expect(updater?.(createDefaultProjectDashboardBacklogState())).toMatchObject({
      assigneeFilter: "Pat Jones",
    });
    expect(outcome).toEqual({
      applied: true,
      promptText: "The dashboard is now filtered to work assigned to Pat Jones.",
    });
  });
});
