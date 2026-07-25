import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { runThreadBootstrap } from "~/t3team/chat/t3team-runThreadBootstrap";
import {
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { registerContextAttachmentRequest } from "~/t3team/t3team-contextAttachmentSync";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

function createBackend(): BackendApi {
  return {
    state: {
      connectionStatus: "connected",
      serverConfig: null,
      providers: [],
      error: null,
    },
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    dispatchCommand: vi.fn(async () => undefined),
    launchRecipeWorkflow: vi.fn(async () => ({ ok: true })),
    submitRecipeCardAction: vi.fn(async () => ({ ok: true })),
    resolveWorkflowInput: vi.fn(async () => undefined),
    listThreadPlacements: vi.fn(async () => []),
    syncThreadToolContext: vi.fn(async () => undefined),
    atlassian: {} as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {
      bootstrapWorkspace: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        workspaceRepositoryInitialized: true,
        referencesRoot: "/tmp/project-alpha/.t3team/references",
        linkedRepositories: [],
      })),
      discoverRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      writeContextFiles: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        writtenFiles: [".t3team/context/misc/project-alpha/context/entrypoint.json"],
      })),
      refreshWorkItemContext: vi.fn(async (input) => ({
        ok: true,
        status: "already_synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        availability: "full" as const,
        entryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        manifestRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/manifest.json`,
        includedCount: 0,
        skippedCount: 0,
      })),
      refreshWorkItemSliceContext: vi.fn(async (input) => ({
        ok: true,
        status: "already_synced" as const,
        projectId: input.projectId,
        ticketKey: input.ticketKey,
        focusKind: input.focusKind,
        availability: "full" as const,
        focusEntryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/focus/${input.focusKind}.json`,
        entryPointRelativePath: `.t3team/context/jira/${input.projectId}/items/${input.ticketKey.toLowerCase()}/entrypoint.json`,
        includedCount: 0,
        skippedCount: 0,
      })),
      listManagedRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      updateManagedRecipe: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        recipe: {
          id: "recipe",
          version: "1.0.0",
          displayName: "Recipe",
          shortDescription: "Recipe",
          surfaces: ["project.dashboard.backlog"] as const,
          active: true,
          sourceKind: "recipe-json" as const,
          editable: true,
          deletable: true,
          recipePath: "/tmp/project-alpha/.t3team/recipes/recipe",
          sourcePath: "/tmp/project-alpha/.t3team/recipes/recipe/recipe.json",
        },
      })),
      deleteManagedRecipe: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        deletedRecipePath: "/tmp/project-alpha/.t3team/recipes/recipe",
      })),
    },
  };
}

function createRequest(): AddToChatRequest {
  return {
    projectId: "project-alpha",
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    targetLabel: "Open PR",
    targetType: "pull-request",
    kind: "github-pull-request",
    dedupeKey: "project-alpha:pr-1",
    payload: { body: "Pull request details" },
  };
}

beforeEach(() => {
  useT3TeamAddToChatStore.setState({
    pendingByProjectId: {},
    pendingByKickoffKey: {},
    threadAttachmentsByThreadId: {},
  });
});

const TEST_TOOL_CONTEXT: T3TeamTurnToolContext = {
  surface: "t3team",
  tools: [
    {
      id: "t3team.view.read",
      label: "Read current view",
      capabilities: ["read"],
    },
  ],
  state: {
    view: {
      kind: "ticket",
      projectId: "project-alpha",
      ticketId: "ticket-1",
    },
  },
};

const TEST_KICKOFF_WORKFLOW: T3TeamKickoffWorkflow = {
  kind: "recipe",
  recipeId: "qa-test-plan",
  recipeVersion: "0.1.0",
  kickoff: {
    version: 1,
    steps: [
      {
        kind: "collect-input",
        id: "collect-brief",
        request: {
          kind: "text",
          when: "missing-prompt",
          promptRequest: {
            title: "Recipe kickoff",
          },
        },
      },
      {
        kind: "agent",
        id: "author",
      },
    ],
  },
  title: "Create QA plan",
  description: "Build a focused QA plan.",
  source: "project-local",
  surface: "workitem.detail.sidepanel",
  reason: "QA planning applies to bugs",
  recipePath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan",
  promptPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/prompt.md",
  workflowPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/workflow.ts",
  allowedToolGroups: ["integration.read"],
};

describe("runThreadBootstrap", () => {
  it("stores queued thread context as kickoff message attachments and clears it after success", async () => {
    const backend = createBackend();
    useT3TeamAddToChatStore.getState().enqueueThreadAttachment("thread-1", {
      id: "ctx-1",
      kind: "github-pull-request",
      label: "Open PR",
      contextText: "### Added Context: Open PR",
    });

    const onInitialUserMessageSent = vi.fn();

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-1",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "Thread title",
      initialUserMessage: "Tell me something about this",
      kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      toolContext: TEST_TOOL_CONTEXT,
      createdAt: "2026-05-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: {
        threadId: "thread-1",
        projectEnsured: false,
        threadCreateSent: false,
        kickoffSent: false,
      },
      onInitialUserMessageSent,
    });

    // Thread bootstrap no longer scaffolds the workspace; scaffolding is owned by the work-project
    // create/sync paths (never thread invocation), so local workspaces are not polluted.
    expect(backend.projectWorkspace.bootstrapWorkspace).not.toHaveBeenCalled();
    expect(backend.syncThreadToolContext).toHaveBeenCalledWith({
      threadId: "thread-1",
      toolContext: TEST_TOOL_CONTEXT,
    });
    expect(backend.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(backend.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.turn.start",
        message: expect.objectContaining({
          text: "### Added Context: Open PR\n\nTell me something about this",
          t3teamExt: expect.objectContaining({
            displayText: "Tell me something about this",
            attachments: [
              expect.objectContaining({
                kind: "resource",
                resource: expect.objectContaining({
                  text: "### Added Context: Open PR",
                }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toBe(
      undefined,
    );
    expect(onInitialUserMessageSent).toHaveBeenCalledOnce();
  });

  it("refreshes registered thread context before kickoff sends", async () => {
    const backend = createBackend();
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "ctx-2" });
    registerContextAttachmentRequest(pendingAttachment.id, request);
    useT3TeamAddToChatStore.getState().enqueueThreadAttachment("thread-2", pendingAttachment);

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-2",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "Thread title",
      initialUserMessage: "Tell me something about this",
      kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      toolContext: TEST_TOOL_CONTEXT,
      createdAt: "2026-05-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: {
        threadId: "thread-2",
        projectEnsured: false,
        threadCreateSent: false,
        kickoffSent: false,
      },
      onInitialUserMessageSent: undefined,
    });

    // Thread bootstrap no longer scaffolds the workspace; scaffolding is owned by the work-project
    // create/sync paths (never thread invocation), so local workspaces are not polluted.
    expect(backend.projectWorkspace.bootstrapWorkspace).not.toHaveBeenCalled();
    expect(backend.syncThreadToolContext).toHaveBeenCalledWith({
      threadId: "thread-2",
      toolContext: TEST_TOOL_CONTEXT,
    });
    expect(backend.projectWorkspace.writeContextFiles).toHaveBeenCalledTimes(1);
    expect(backend.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: expect.stringContaining("Open PR"),
          t3teamExt: expect.objectContaining({
            displayText: "Tell me something about this",
            attachments: [
              expect.objectContaining({
                kind: "resource",
                resource: expect.objectContaining({
                  text: expect.stringContaining("Open PR"),
                }),
              }),
            ],
          }),
        }),
      }),
    );
    expect(useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId["thread-2"]).toBe(
      undefined,
    );
  });

  it("routes recipe kickoffs through the dedicated launch endpoint", async () => {
    const backend = createBackend();

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-3",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "Thread title",
      initialUserMessage: "Tell me something about this",
      kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      kickoffWorkflow: TEST_KICKOFF_WORKFLOW,
      toolContext: TEST_TOOL_CONTEXT,
      createdAt: "2026-05-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: {
        threadId: "thread-3",
        projectEnsured: false,
        threadCreateSent: false,
        kickoffSent: false,
      },
      onInitialUserMessageSent: undefined,
    });

    expect(backend.dispatchCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "thread.create",
      }),
    );
    expect(backend.launchRecipeWorkflow).toHaveBeenCalledWith({
      threadId: "thread-3",
      kickoffMessage: "Tell me something about this",
      titleSeed: "Thread title",
      createdAt: "2026-05-19T12:00:00.000Z",
      modelSelection: {
        instanceId: "codex",
        model: "gpt-5.4",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      launch: {
        kind: "recipe",
        recipeId: "qa-test-plan",
        recipeVersion: "0.1.0",
        kickoff: {
          version: 1,
          steps: [
            {
              kind: "collect-input",
              id: "collect-brief",
              request: {
                kind: "text",
                when: "missing-prompt",
                promptRequest: {
                  title: "Recipe kickoff",
                },
              },
            },
            {
              kind: "agent",
              id: "author",
            },
          ],
        },
        title: "Create QA plan",
        description: "Build a focused QA plan.",
        source: "project-local",
        surface: "workitem.detail.sidepanel",
        reason: "QA planning applies to bugs",
        recipePath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan",
        promptPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/prompt.md",
        workflowPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/workflow.ts",
        allowedToolGroups: ["integration.read"],
      },
    });
  });

  it("runs prompt-only recipe kickoffs as a normal agent turn", async () => {
    const backend = createBackend();
    const promptOnlyWorkflow: T3TeamKickoffWorkflow = {
      kind: "recipe",
      recipeId: "tshirt-size-epic",
      recipeVersion: "0.1.0",
      title: "T-shirt-size this epic",
      description: "Estimate the selected epic.",
      source: "bundled",
      surface: "workitem.detail.sidepanel",
      allowedToolGroups: ["integration.read", "artifact.rw", "ui.render"],
    };

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-3b",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "T-shirt-size this epic",
      initialUserMessage: "T-shirt-size PROJ-100 using Jira, code, and precedent work.",
      kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      kickoffWorkflow: promptOnlyWorkflow,
      toolContext: TEST_TOOL_CONTEXT,
      createdAt: "2026-05-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: {
        threadId: "thread-3b",
        projectEnsured: false,
        threadCreateSent: false,
        kickoffSent: false,
      },
      onInitialUserMessageSent: undefined,
    });

    expect(backend.launchRecipeWorkflow).not.toHaveBeenCalled();
    expect(backend.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.turn.start",
        threadId: "thread-3b",
        message: expect.objectContaining({
          text: "T-shirt-size PROJ-100 using Jira, code, and precedent work.",
        }),
      }),
    );
  });

  it("continues recipe launch when retrying after the thread already exists", async () => {
    const backend = createBackend();
    vi.mocked(backend.dispatchCommand).mockRejectedValueOnce(
      new Error("Thread 'thread-4' already exists and cannot be created twice."),
    );

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-4",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "Thread title",
      initialUserMessage: "Tell me something about this",
      kickoffModelSelection: { instanceId: "codex" as any, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      kickoffWorkflow: TEST_KICKOFF_WORKFLOW,
      toolContext: TEST_TOOL_CONTEXT,
      createdAt: "2026-05-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: {
        threadId: "thread-4",
        projectEnsured: false,
        threadCreateSent: false,
        kickoffSent: false,
      },
      onInitialUserMessageSent: undefined,
    });

    expect(backend.launchRecipeWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-4",
        kickoffMessage: "Tell me something about this",
      }),
    );
  });
});
