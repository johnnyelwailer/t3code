import { describe, expect, it } from "vite-plus/test";

import { mergeProjectThreads } from "~/t3team/hooks/t3team-threadBridge";
import {
  mergeProjectThreadLocalState,
  setProjectThreadDisplayMode,
  upsertProjectThreadLocalState,
} from "./t3team-threadToolContext";
import type { ProjectThread } from "./t3team-types";
import { createT3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";

function makeThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: overrides.id ?? "thread-1",
    projectId: overrides.projectId ?? "project-1",
    title: overrides.title ?? "Thread",
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? "2026-05-22T10:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-22T10:00:00.000Z",
    status: overrides.status ?? "idle",
    ...overrides,
  };
}

describe("mergeProjectThreadLocalState", () => {
  it("preserves dashboard ownership, ticket alias metadata, and display mode from local shadow thread state", () => {
    const existing = makeThread({
      ticketId: "ticket-1",
      ticketDisplayId: "PROJ-1",
      dashboardMode: "backlog",
      displayMode: "thread",
      kickoffMessage: "Plan this work",
    });
    const next = makeThread({ title: "Live thread" });

    expect(mergeProjectThreadLocalState(existing, next)).toEqual({
      ...next,
      ticketId: "ticket-1",
      ticketDisplayId: "PROJ-1",
      dashboardMode: "backlog",
      displayMode: "thread",
      kickoffMessage: "Plan this work",
    });
  });
});

describe("upsertProjectThreadLocalState", () => {
  it("persists newly observed child-thread metadata into the local shadow state", () => {
    const liveThread = makeThread({
      id: "thread-child",
      ticketId: "ticket-1",
      parentThreadId: "thread-parent",
    });

    expect(upsertProjectThreadLocalState([], liveThread)).toEqual([liveThread]);
  });

  it("merges observed child-thread metadata without dropping remembered display mode", () => {
    const existingShadow = makeThread({
      id: "thread-child",
      ticketId: "ticket-1",
      displayMode: "thread",
    });
    const liveThread = makeThread({
      id: "thread-child",
      ticketId: "ticket-1",
      parentThreadId: "thread-parent",
      title: "Live child thread",
      status: "running",
    });

    expect(upsertProjectThreadLocalState([existingShadow], liveThread)).toEqual([
      {
        ...liveThread,
        displayMode: "thread",
      },
    ]);
  });
});

describe("setProjectThreadDisplayMode", () => {
  it("creates a local shadow for live-only threads when remembering a display mode", () => {
    const liveThread = makeThread({
      id: "thread-child",
      ticketId: "ticket-1",
      parentThreadId: "thread-parent",
    });

    expect(setProjectThreadDisplayMode([], "thread-child", "thread", liveThread)).toEqual([
      {
        ...liveThread,
        displayMode: "thread",
      },
    ]);
  });
});

describe("createT3TeamTurnToolContext", () => {
  it("enables the default t3team tools when no explicit selection is stored", () => {
    const toolContext = createT3TeamTurnToolContext({
      projectId: "project-alpha",
      projectTitle: "Project Alpha",
      workspaceRoot: "/workspace/project-alpha",
      threadId: "thread-1",
      threadTitle: "Kickoff",
    });

    expect(toolContext).toEqual({
      surface: "t3team",
      tools: [
        // Catalog order: t3team.widget.show is the first defaultEnabled entry
        // in IMPLEMENTED_T3TEAM_TOOL_CATALOG.
        {
          id: "t3team.widget.show",
          label: "Show widget",
          capabilities: ["write"],
        },
        {
          id: "t3team.view.read",
          label: "Read view",
          capabilities: ["read"],
        },
        {
          id: "t3team.recipe.list",
          label: "List project recipes",
          capabilities: ["read"],
        },
        {
          id: "t3team.recipe.validate",
          label: "Validate recipe workflow",
          capabilities: ["read"],
        },
        {
          id: "t3team.orchestration.run",
          label: "Run ephemeral orchestration",
          capabilities: ["write"],
        },
        {
          id: "t3team.thread.rename",
          label: "Rename thread",
          capabilities: ["write"],
        },
        {
          id: "t3team.thread.search_source",
          label: "Search fork source thread",
          capabilities: ["read"],
        },
        {
          id: "t3team.thread.read_message",
          label: "Read inter-agent message",
          capabilities: ["read"],
        },
        {
          id: "t3team.thread.start_child",
          label: "Start child session",
          capabilities: ["write"],
        },
        {
          id: "t3team.thread.children",
          label: "Manage child sessions",
          capabilities: ["write"],
        },
        {
          id: "t3team.work_item.refresh_context_bundle",
          label: "Refresh work item context bundle",
          capabilities: ["write"],
        },
      ],
      state: {
        view: {
          kind: "thread",
          projectId: "project-alpha",
          projectTitle: "Project Alpha",
          workspaceRoot: "/workspace/project-alpha",
          threadId: "thread-1",
          threadTitle: "Kickoff",
          displayMode: "thread",
        },
      },
    });
  });

  it("maps selected t3team tools into a normalized turn context", () => {
    const toolContext = createT3TeamTurnToolContext({
      projectId: "project-alpha",
      projectTitle: "Project Alpha",
      workspaceRoot: "/workspace/project-alpha",
      threadId: "thread-1",
      threadTitle: "Kickoff",
      displayMode: "embedded",
      ticketId: "10001",
      ticketDisplayId: "PROJ-7",
      selectedToolIds: [
        "t3team.view.read",
        "t3team.view.read",
        "t3team.thread.rename",
        "t3team.thread.start_child",
      ],
    });

    expect(toolContext).toEqual({
      surface: "t3team",
      tools: [
        {
          id: "t3team.view.read",
          label: "Read view",
          capabilities: ["read"],
        },
        {
          id: "t3team.thread.rename",
          label: "Rename thread",
          capabilities: ["write"],
        },
        {
          id: "t3team.thread.start_child",
          label: "Start child session",
          capabilities: ["write"],
        },
      ],
      state: {
        view: {
          kind: "thread",
          projectId: "project-alpha",
          projectTitle: "Project Alpha",
          workspaceRoot: "/workspace/project-alpha",
          threadId: "thread-1",
          threadTitle: "Kickoff",
          displayMode: "embedded",
          ticketId: "10001",
          ticketDisplayId: "PROJ-7",
        },
      },
    });
  });

  it("includes kickoff metadata when a thread is waiting on a guided first prompt", () => {
    const toolContext = createT3TeamTurnToolContext({
      projectId: "project-alpha",
      projectTitle: "Project Alpha",
      workspaceRoot: "/workspace/project-alpha",
      threadId: "thread-1",
      threadTitle: "Kickoff",
      kickoffMessage: "Recipe authoring kickoff",
      kickoffPending: false,
      kickoffWorkflow: {
        kind: "recipe",
        recipeId: "create-contextual-recipe",
        title: "Create a recipe for this context",
        description: "Design a contextual recipe for the current surface.",
        source: "bundled",
        surface: "project.dashboard.backlog",
        promptPath: "/workspace/project-alpha/.t3team/recipes/create-contextual-recipe/prompt.md",
        workflowPath:
          "/workspace/project-alpha/.t3team/recipes/create-contextual-recipe/workflow.ts",
        launchContext: {
          surface: "project.dashboard.backlog",
          project: {
            title: "Project Alpha",
            provider: "managed",
            workspaceRoot: "/workspace/project-alpha",
          },
          linkedResources: { state: "ready", items: [] },
          artifacts: { state: "ready", items: [] },
          profile: {
            technicalDepth: "medium",
            brevity: "balanced",
            guidanceStyle: "balanced",
            detailDensity: "balanced",
            preferredArtifactKinds: [],
            defaultActionFamilies: [],
            defaultRecipeWeights: {},
          },
          schema: {},
          enabledSkillPacks: ["core"],
          availableContextKeys: { state: "ready", items: ["project", "workitem"] },
        },
      },
    });

    expect(toolContext).toBeDefined();
    if (!toolContext) {
      throw new Error("Expected tool context");
    }

    expect(toolContext.state).toMatchObject({
      kickoff: {
        message: "Recipe authoring kickoff",
        pending: false,
        workflow: {
          recipeId: "create-contextual-recipe",
          surface: "project.dashboard.backlog",
          promptPath: "/workspace/project-alpha/.t3team/recipes/create-contextual-recipe/prompt.md",
          workflowPath:
            "/workspace/project-alpha/.t3team/recipes/create-contextual-recipe/workflow.ts",
          launchContext: {
            surface: "project.dashboard.backlog",
            project: {
              title: "Project Alpha",
              provider: "managed",
              workspaceRoot: "/workspace/project-alpha",
            },
          },
        },
      },
    });
  });
});

describe("mergeProjectThreads", () => {
  it("preserves local tool selection and kickoff metadata when live threads arrive", () => {
    const localThread: ProjectThread = {
      id: "thread-1",
      projectId: "project-alpha",
      title: "Local title",
      status: "idle",
      lastMessageAt: "2026-05-20T10:00:00.000Z",
      messageCount: 0,
      createdAt: "2026-05-20T10:00:00.000Z",
      kickoffMessage: "Investigate this ticket",
      selectedToolIds: [],
    };

    const liveThread: ProjectThread = {
      id: "thread-1",
      projectId: "project-alpha",
      title: "Live title",
      status: "running",
      lastMessageAt: "2026-05-20T10:05:00.000Z",
      messageCount: 3,
      createdAt: "2026-05-20T10:00:00.000Z",
    };

    expect(mergeProjectThreads([localThread, liveThread])).toEqual([
      {
        ...liveThread,
        kickoffMessage: "Investigate this ticket",
        selectedToolIds: [],
      },
    ]);
  });
});
