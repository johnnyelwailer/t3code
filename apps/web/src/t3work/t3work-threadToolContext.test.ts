import { describe, expect, it } from "vitest";

import { mergeProjectThreads } from "~/t3work/hooks/t3work-threadBridge";
import {
  mergeProjectThreadLocalState,
  setProjectThreadDisplayMode,
  upsertProjectThreadLocalState,
} from "./t3work-threadToolContext";
import type { ProjectThread } from "./t3work-types";
import { createT3workTurnToolContext } from "~/t3work/t3work-threadToolContext";

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

describe("createT3workTurnToolContext", () => {
  it("enables the default t3work tools when no explicit selection is stored", () => {
    const toolContext = createT3workTurnToolContext({
      projectId: "project-alpha",
      projectTitle: "Project Alpha",
      workspaceRoot: "/workspace/project-alpha",
      threadId: "thread-1",
      threadTitle: "Kickoff",
    });

    expect(toolContext).toEqual({
      surface: "t3work",
      tools: [
        {
          id: "t3work.view.read",
          label: "Read view",
          capabilities: ["read"],
        },
        {
          id: "t3work.thread.rename",
          label: "Rename thread",
          capabilities: ["write"],
        },
        {
          id: "t3work.thread.start_child",
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
          displayMode: "thread",
        },
      },
    });
  });

  it("maps selected t3work tools into a normalized turn context", () => {
    const toolContext = createT3workTurnToolContext({
      projectId: "project-alpha",
      projectTitle: "Project Alpha",
      workspaceRoot: "/workspace/project-alpha",
      threadId: "thread-1",
      threadTitle: "Kickoff",
      displayMode: "embedded",
      ticketId: "ticket-1",
      selectedToolIds: [
        "t3work.view.read",
        "t3work.view.read",
        "t3work.thread.rename",
        "t3work.thread.start_child",
      ],
    });

    expect(toolContext).toEqual({
      surface: "t3work",
      tools: [
        {
          id: "t3work.view.read",
          label: "Read view",
          capabilities: ["read"],
        },
        {
          id: "t3work.thread.rename",
          label: "Rename thread",
          capabilities: ["write"],
        },
        {
          id: "t3work.thread.start_child",
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
          ticketId: "ticket-1",
        },
      },
    });
  });

  it("includes kickoff metadata when a thread is waiting on a guided first prompt", () => {
    const toolContext = createT3workTurnToolContext({
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
        surface: "project.dashboard",
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
          surface: "project.dashboard",
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
