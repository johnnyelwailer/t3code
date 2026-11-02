import { ProviderInstanceId } from "@t3tools/contracts";
import { createEmptyT3TeamActionRecipeContext } from "@t3tools/project-context";
import { ProjectShellProjectId, type ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it, vi } from "vite-plus/test";

import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createThreadChatTurnToolContext } from "~/t3team/chat/t3team-useThreadChatTurnToolContext";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import { launchSidecarRecipeQuickStartThread } from "~/t3team/t3team-sidecarRecipeLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import { DEFAULT_T3TEAM_THREAD_TOOL_IDS } from "~/t3team/t3team-threadToolContext";

// The real bootstrap helper runs here: only the backend it talks to is a recording fake.
const project: ProjectShellProject = {
  id: ProjectShellProjectId.make("project-alpha"),
  title: "Alpha",
  source: { provider: "atlassian" },
  workspace: { rootPath: "/workspace/project-alpha", createdAt: "2026-01-01T00:00:00.000Z" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const launchConfig: T3TeamKickoffLaunchConfig = {
  selection: { instanceId: ProviderInstanceId.make("instance-1"), model: "model-1" },
  runtimeMode: "auto",
  interactionMode: "default",
  selectedToolIds: DEFAULT_T3TEAM_THREAD_TOOL_IDS,
};

const launchContext = createEmptyT3TeamActionRecipeContext("workitem.detail.sidepanel");

const quickStart: T3TeamSidecarRecipeQuickStart = {
  id: "fix-this-bug",
  title: "Fix this bug",
  description: "Reproduce, fix and verify a bug.",
  prompt: "Fix the bug.",
  workflow: {
    kind: "recipe",
    recipeId: "fix-this-bug",
    title: "Fix this bug",
    description: "Reproduce, fix and verify a bug.",
    source: "bundled",
    surface: "workitem.detail.sidepanel",
    recipePath: "/workspace/project-alpha/.t3team/recipes/fix-this-bug",
    workflowPath: "/workspace/project-alpha/.t3team/recipes/fix-this-bug/workflow.ts",
    launchContext,
  },
};

async function launch(
  toolContextSource?: Parameters<
    typeof launchSidecarRecipeQuickStartThread
  >[0]["toolContextSource"],
) {
  const syncThreadToolContext = vi.fn(async (_input: unknown) => undefined);
  const backend = {
    orchestration: createRecordingOrchestrationApi(),
    launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
    syncThreadToolContext,
  } as unknown as BackendApi;
  const launched = await launchSidecarRecipeQuickStartThread({
    backend,
    environmentId: "env-1",
    projectId: "project-alpha",
    quickStart,
    launchConfig,
    createThread: async () => "thread-real-1",
    ...(toolContextSource ? { toolContextSource } : {}),
  });
  expect(launched).toBe(true);
  return syncThreadToolContext.mock.calls[0]?.[0] as unknown as {
    readonly threadId: string;
    readonly toolContext: {
      readonly state: {
        readonly view: Record<string, unknown>;
        readonly kickoff: Record<string, unknown>;
      };
    } | null;
  };
}

describe("launching a Quick Start through the real bootstrap", () => {
  it("writes no context for a surface that supplies no project source (the previous behavior)", async () => {
    const synced = await launch();
    expect(synced).toEqual({ threadId: "thread-real-1", toolContext: null });
  });

  it("writes the project, ticket and recipe context a surface with a ticket supplies", async () => {
    const synced = await launch({ project, ticketId: "ticket-7", ticketDisplayId: "PRJ-1" });

    // The shape the thread's own chat builds for the same thread (embedded, kickoff pending).
    const threadChat = createThreadChatTurnToolContext({
      embeddedMode: true,
      kickoffMessage: quickStart.prompt,
      kickoffPending: true,
      kickoffWorkflow: quickStart.workflow,
      projectId: project.id,
      projectTitle: project.title,
      projectSource: project.source,
      projectWorkspaceRoot: project.workspace?.rootPath,
      selectedToolIds: DEFAULT_T3TEAM_THREAD_TOOL_IDS,
      threadId: "thread-real-1",
      ticketId: "ticket-7",
      ticketDisplayId: "PRJ-1",
      title: quickStart.title,
    });
    expect(synced.toolContext).toEqual(threadChat);
    expect(synced.toolContext?.state.view).toMatchObject({
      projectId: "project-alpha",
      ticketId: "ticket-7",
      ticketDisplayId: "PRJ-1",
      displayMode: "embedded",
    });
    expect(synced.toolContext?.state.kickoff).toMatchObject({
      pending: true,
      workflow: { recipeId: "fix-this-bug", launchContext },
    });
  });
});
