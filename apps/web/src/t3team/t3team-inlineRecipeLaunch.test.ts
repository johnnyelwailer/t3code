import { describe, expect, it, vi } from "vite-plus/test";

import { createDefaultProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogStateShared";
import { launchProjectDashboardBacklogDeterministicWorkflow } from "~/t3team/t3team-deterministicWorkflowLaunch";
import { launchProjectDashboardBacklogInlineRecipe } from "~/t3team/t3team-inlineRecipeLaunch";

describe("launchProjectDashboardBacklogInlineRecipe", () => {
  it("launches the bundled deterministic backlog recipe and applies the returned view-state patch", async () => {
    const launchRecipeWorkflow = vi.fn(async () => ({
      ok: true,
      mode: "deterministic" as const,
      workflowRunId: "t3team:recipe-workflow:deterministic:test-run",
      effects: [
        {
          kind: "view-state-patch" as const,
          stepId: "apply-assignee-filter",
          toolName: "t3team.backlog.set_assignee_filter",
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
                toolName: "t3team.backlog.set_assignee_filter",
                input: { mode: "current-user" },
              }),
            ],
          },
          allowedToolGroups: ["view.state"],
        }),
        toolContext: expect.objectContaining({
          tools: [
            expect.objectContaining({
              id: "t3team.backlog.set_assignee_filter",
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

  it("launches an explicit deterministic workflow payload through the same runtime path", async () => {
    const launchRecipeWorkflow = vi.fn(async () => ({
      ok: true,
      mode: "deterministic" as const,
      workflowRunId: "t3team:recipe-workflow:deterministic:test-run",
      effects: [],
      completionActivity: {
        title: "Apply filter now",
        description: "The dashboard is now filtered to work assigned to Pat Jones.",
        tone: "success" as const,
      },
    }));
    const setState = vi.fn();

    await launchProjectDashboardBacklogDeterministicWorkflow({
      backend: { launchRecipeWorkflow } as never,
      launchId: "quick-starts.item.show-only-assigned-to-me.apply-now",
      title: "Apply filter now",
      description: "Apply the visible assignee filter without opening chat.",
      surface: "project.dashboard.backlog",
      workflow: {
        steps: [
          {
            kind: "tool",
            id: "apply-now",
            toolName: "t3team.backlog.set_assignee_filter",
            input: {
              mode: "current-user",
              itemId: "show-only-assigned-to-me",
            },
          },
        ],
      },
      workspaceRoot: "/workspace/project-1",
      projectId: "project-1",
      projectTitle: "Project One",
      state: createDefaultProjectDashboardBacklogState(),
      currentUserDisplayName: "Pat Jones",
      setState,
      allowedToolGroups: ["view.state"],
      source: "bundled",
    });

    expect(launchRecipeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "/workspace/project-1",
        launch: expect.objectContaining({
          recipeId: "quick-starts.item.show-only-assigned-to-me.apply-now",
          kickoff: {
            steps: [
              expect.objectContaining({
                kind: "tool",
                toolName: "t3team.backlog.set_assignee_filter",
                input: {
                  mode: "current-user",
                  itemId: "show-only-assigned-to-me",
                },
              }),
            ],
          },
          allowedToolGroups: ["view.state"],
        }),
      }),
    );
    expect(setState).not.toHaveBeenCalled();
  });
});
