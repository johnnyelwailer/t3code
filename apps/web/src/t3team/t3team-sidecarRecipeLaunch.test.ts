import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ProviderInstanceId } from "@t3tools/contracts";
import { ProjectShellProjectId, type ProjectShellProject } from "@t3tools/project-context";

import {
  buildBundledSidecarRecipeKickoffMessage,
  buildBundledSidecarRecipeWorkflowLaunch,
  launchBundledSidecarRecipeThread,
  launchSidecarRecipeQuickStartThread,
  type BundledRecipeWorkflow,
} from "~/t3team/t3team-sidecarRecipeLaunch";
import { buildT3TeamKickoffWorkItemRef } from "~/t3team/t3team-kickoffWorkItemRef";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { BackendApi } from "~/t3team/backend/t3team-types";

const { runThreadBootstrapKickoffMock } = vi.hoisted(() => ({
  runThreadBootstrapKickoffMock: vi.fn(
    async (input: {
      readonly kickoffWorkflow?: { readonly parameters?: Record<string, unknown> };
    }) => {
      void input;
    },
  ),
}));

vi.mock("~/t3team/chat/t3team-runThreadBootstrapKickoff", () => ({
  runThreadBootstrapKickoff: runThreadBootstrapKickoffMock,
}));

type LaunchWorkflow = { readonly parameters?: Record<string, unknown> };

const project: ProjectShellProject = {
  id: ProjectShellProjectId.make("project-alpha"),
  title: "Alpha",
  source: { provider: "atlassian" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// The launch functions only need a truthy backend; the truthiness check is what is under test.
const backend = {} as BackendApi;

const workItem = buildT3TeamKickoffWorkItemRef({
  resourceKind: "ticket",
  selectedWorkLabel: "PRJ-1",
  project,
});

const launchConfig: T3TeamKickoffLaunchConfig = {
  selection: { instanceId: ProviderInstanceId.make("instance-1"), model: "model-1" },
  runtimeMode: "auto",
  interactionMode: "default",
  selectedToolIds: [],
};

const recipeWorkflow: BundledRecipeWorkflow = {
  kind: "recipe",
  recipeId: "fix-this-bug",
  title: "Fix this bug",
  description: "Reproduce, fix and verify a bug.",
  source: "bundled",
  surface: "workitem.detail.sidepanel",
  recipePath: "/workspace/project-alpha/.t3team/recipes/fix-this-bug",
  workflowPath: "/workspace/project-alpha/.t3team/recipes/fix-this-bug/workflow.ts",
};

describe("buildBundledSidecarRecipeWorkflowLaunch", () => {
  it("uses local workflow files and omits inline kickoff for workflow-backed bundled recipes", () => {
    const workflow = buildBundledSidecarRecipeWorkflowLaunch({
      recipeId: "describe-rewrite",
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: "/workspace/project-alpha",
    });

    expect(workflow).toMatchObject({
      recipeId: "describe-rewrite",
      recipePath: "/workspace/project-alpha/.t3team/recipes/describe-rewrite",
      workflowPath: "/workspace/project-alpha/.t3team/recipes/describe-rewrite/workflow.ts",
    });
    expect(workflow?.kickoff).toBeUndefined();
  });

  it("returns null when a workflow-backed bundled recipe has no editable workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "describe-rewrite",
        surface: "workitem.detail.sidepanel",
      }),
    ).toBeNull();
  });

  it("returns null for prompt-only bundled recipes even with a workspace root", () => {
    expect(
      buildBundledSidecarRecipeWorkflowLaunch({
        recipeId: "manage-project-recipes",
        surface: "workitem.detail.sidepanel",
        projectWorkspaceRoot: "/workspace/project-alpha",
      }),
    ).toBeNull();
  });

  it("builds a focused default kickoff message for manage-project-recipes edits", () => {
    expect(
      buildBundledSidecarRecipeKickoffMessage({
        recipeId: "manage-project-recipes",
        parameters: { targetPath: "./.t3team/recipes/local/recipe.json" },
      }),
    ).toContain("Edit the recipe or plugin module at ./.t3team/recipes/local/recipe.json");
  });
});

describe("launchSidecarRecipeQuickStartThread work item", () => {
  beforeEach(() => {
    runThreadBootstrapKickoffMock.mockClear();
  });

  it("passes the selected work item into the launched workflow args", async () => {
    let createdWorkflow: LaunchWorkflow | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffWorkflow?: LaunchWorkflow }) => {
      createdWorkflow = input.kickoffWorkflow;
      return "thread-1";
    });

    const launched = await launchSidecarRecipeQuickStartThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      quickStart: {
        id: "fix-this-bug",
        title: "Fix this bug",
        description: "Reproduce, fix and verify a bug.",
        prompt: "Fix the bug on PRJ-1.",
        workflow: recipeWorkflow,
      },
      launchConfig,
      ...(workItem ? { workItem } : {}),
      createThread,
    });

    expect(launched).toBe(true);
    expect(createdWorkflow?.parameters).toMatchObject({
      issueIdOrKey: "PRJ-1",
      workItem: { key: "PRJ-1", provider: "atlassian", project: "project-alpha" },
    });

    const bootstrapInput = runThreadBootstrapKickoffMock.mock.calls[0]?.[0];
    expect(bootstrapInput?.kickoffWorkflow?.parameters).toMatchObject({
      issueIdOrKey: "PRJ-1",
      workItem: { key: "PRJ-1", provider: "atlassian", project: "project-alpha" },
    });
  });

  it("leaves the workflow untouched when there is no work item", async () => {
    let createdWorkflow: LaunchWorkflow | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffWorkflow?: LaunchWorkflow }) => {
      createdWorkflow = input.kickoffWorkflow;
      return "thread-1";
    });

    const launched = await launchSidecarRecipeQuickStartThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      quickStart: {
        id: "fix-this-bug",
        title: "Fix this bug",
        description: "Reproduce, fix and verify a bug.",
        prompt: "Fix the bug.",
        workflow: recipeWorkflow,
      },
      launchConfig,
      createThread,
    });

    expect(launched).toBe(true);
    expect(createdWorkflow?.parameters).toBeUndefined();
  });

  it("lets explicit workflow parameters win over the work item for the same key", async () => {
    let createdWorkflow: LaunchWorkflow | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffWorkflow?: LaunchWorkflow }) => {
      createdWorkflow = input.kickoffWorkflow;
      return "thread-1";
    });

    await launchSidecarRecipeQuickStartThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      quickStart: {
        id: "fix-this-bug",
        title: "Fix this bug",
        description: "Reproduce, fix and verify a bug.",
        prompt: "Fix the bug.",
        workflow: { ...recipeWorkflow, parameters: { issueIdOrKey: "USER-SET-9" } },
      },
      launchConfig,
      ...(workItem ? { workItem } : {}),
      createThread,
    });

    expect(createdWorkflow?.parameters?.issueIdOrKey).toBe("USER-SET-9");
    expect(createdWorkflow?.parameters?.workItem).toMatchObject({ key: "PRJ-1" });
  });

  it("sends a prompt-backed recipe's prompt with no workflow on click", async () => {
    let created:
      | {
          readonly kickoffMessage?: string;
          readonly kickoffWorkflow?: unknown;
        }
      | undefined;
    const createThread = vi.fn(
      async (input: { readonly kickoffMessage: string; readonly kickoffWorkflow?: unknown }) => {
        created = input;
        return "thread-1";
      },
    );

    const launched = await launchSidecarRecipeQuickStartThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      quickStart: {
        id: "explain-selected-work",
        title: "Explain this simply",
        description: "Summarize the selected work.",
        prompt: "Explain PRJ-1 in plain language.",
      },
      launchConfig,
      createThread,
    });

    expect(launched).toBe(true);
    expect(created?.kickoffMessage).toBe("Explain PRJ-1 in plain language.");
    expect(created?.kickoffWorkflow).toBeUndefined();
  });

  it("applies the quick-start customization to the prompt sent on click", async () => {
    let created: { readonly kickoffMessage?: string } | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffMessage: string }) => {
      created = input;
      return "thread-1";
    });

    await launchSidecarRecipeQuickStartThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      quickStart: {
        id: "explain-selected-work",
        title: "Explain this simply",
        description: "Summarize the selected work.",
        prompt: "Explain PRJ-1 in plain language.",
      },
      customization: {
        selections: [
          {
            name: "explanationAudience",
            label: "Explain for",
            value: "qa",
            promptText: "Bias toward behavior changes and open verification questions.",
          },
        ],
      },
      launchConfig,
      createThread,
    });

    expect(created?.kickoffMessage).toBe(
      "Explain PRJ-1 in plain language.\n\nAdditional launch guidance:\n- Bias toward behavior changes and open verification questions.",
    );
  });
});

describe("launchBundledSidecarRecipeThread work item", () => {
  beforeEach(() => {
    runThreadBootstrapKickoffMock.mockClear();
  });

  it("merges the selected work item into the built workflow parameters", async () => {
    let createdWorkflow: LaunchWorkflow | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffWorkflow?: LaunchWorkflow }) => {
      createdWorkflow = input.kickoffWorkflow;
      return "thread-1";
    });

    const launched = await launchBundledSidecarRecipeThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: "/workspace/project-alpha",
      recipeId: "describe-rewrite",
      ...(workItem ? { workItem } : {}),
      launchConfig,
      createThread,
    });

    expect(launched).toBe(true);
    expect(createdWorkflow?.parameters).toMatchObject({
      issueIdOrKey: "PRJ-1",
      workItem: { key: "PRJ-1", provider: "atlassian", project: "project-alpha" },
    });
  });

  it("lets explicit parameters win over the work item for the same key", async () => {
    let createdWorkflow: LaunchWorkflow | undefined;
    const createThread = vi.fn(async (input: { readonly kickoffWorkflow?: LaunchWorkflow }) => {
      createdWorkflow = input.kickoffWorkflow;
      return "thread-1";
    });

    await launchBundledSidecarRecipeThread({
      backend,
      environmentId: "env-1",
      projectId: "project-alpha",
      surface: "workitem.detail.sidepanel",
      projectWorkspaceRoot: "/workspace/project-alpha",
      recipeId: "describe-rewrite",
      parameters: { issueIdOrKey: "USER-SET-9" },
      ...(workItem ? { workItem } : {}),
      launchConfig,
      createThread,
    });

    expect(createdWorkflow?.parameters?.issueIdOrKey).toBe("USER-SET-9");
    // The full reference still points at the selected work item.
    expect(createdWorkflow?.parameters?.workItem).toMatchObject({ key: "PRJ-1" });
  });
});
