/**
 * Measurement + behaviour tests for the instant-thread kickoff.
 *
 * "Before" evidence (old architecture, captured 2026-10-19):
 *  - The pre-shell view was a blocking spinner panel ("Creating thread..."); the first user
 *    message was not visible until the server shell existed.
 *  - The kickoff chain is serial: thread.create → context sync → tool-context sync → launch,
 *    so a slow context refresh delayed both the thread content and the run start.
 *
 * "After" behaviour (asserted here): the thread content — the kickoff as the first message plus
 * inline progress steps — renders immediately; each preparation step resolves to done/error
 * inline; a failure keeps the conversation and offers a retry.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import type { EnvironmentId } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { createRecordingOrchestrationApi } from "~/t3team/backend/t3team-orchestrationApi.testSupport";
import { runThreadBootstrap } from "~/t3team/chat/t3team-runThreadBootstrap";
import type { ThreadChatViewBodyProps } from "~/t3team/chat/t3team-ThreadChatViewBody";
import type { ThreadBootstrapProgress } from "~/t3team/chat/t3team-threadBootstrapProgress";
import {
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { registerContextAttachmentRequest } from "~/t3team/t3team-contextAttachmentSync";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

vi.mock("~/components/ChatView", () => ({
  default: () => <div data-testid="chat-view" />,
}));
vi.mock("~/t3team/chat/t3team-ThreadComposerAccessory", () => ({
  T3TeamThreadComposerAccessory: () => null,
}));
vi.mock("~/t3team/outbox/t3team-outboxStore", () => ({
  useT3TeamOutboxStore: () => ({ entries: [], dispatchingEntryId: null, failures: {} }),
}));
vi.mock("~/t3team/outbox/t3team-useOutboxDrain", () => ({ useT3TeamOutboxDrain: () => {} }));
vi.mock("~/t3team/outbox/t3team-outboxTimelineRows", () => ({
  t3TeamOutboxTimelineExtensions: () => [],
}));

import { ThreadChatViewBody } from "./t3team-ThreadChatViewBody";

function body(threadId: string, overrides: Partial<ThreadChatViewBodyProps> = {}) {
  const props: ThreadChatViewBodyProps = {
    environmentId: "env-1" as EnvironmentId,
    threadId,
    projectId: "project-1",
    hasServerThread: false,
    showKickoffPlaceholder: true,
    kickoffMessage: "Fix the login regression",
    kickoffPending: undefined,
    kickoffWorkflow: undefined,
    kickoffHistoryMessage: undefined,
    onBack: undefined,
    titleBarControlsAccessory: undefined,
    hideHeader: true,
    embeddedMode: true,
    backend: null,
    bootstrapStatus: "running",
    bootstrapProgress: null,
    retryThreadBootstrap: () => {},
    composerState: {
      composerDropTarget: { composerContainerProps: {}, composerContainerOverlay: null },
      contextAttachments: [],
    } as never,
    ...overrides,
  };
  return <ThreadChatViewBody key={threadId} {...props} />;
}

function createRequest(): AddToChatRequest {
  return {
    projectId: "project-alpha",
    projectTitle: "Project Alpha",
    projectWorkspaceRoot: "/tmp/project-alpha",
    targetLabel: "PRJ-1",
    targetType: "issue",
    kind: "jira-issue",
    dedupeKey: "project-alpha:PRJ-1",
    payload: { body: "Work item details" },
  };
}

const WORKFLOW: T3TeamKickoffWorkflow = {
  kind: "recipe",
  recipeId: "qa-test-plan",
  title: "Create QA plan",
  description: "Build a focused QA plan.",
  source: "project-local" as const,
  surface: "workitem.detail.sidepanel" as const,
  recipePath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan",
  promptPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/prompt.md",
  workflowPath: "/tmp/project-alpha/.t3team/recipes/qa-test-plan/workflow.ts",
};

function freshState(threadId: string) {
  return {
    threadId,
    projectEnsured: false,
    threadCreateSent: false,
    kickoffSent: false,
    dispatchedBranch: undefined,
    branchBackfillSent: false,
  };
}

function createLatencyBackend(input: {
  createThreadMs: number;
  contextSyncMs: number;
  toolSyncMs: number;
  launchMs: number;
}) {
  const calls: string[] = [];
  const start = Date.now();
  const mark = (name: string) => {
    calls.push(`${name}+${Date.now() - start}ms`);
  };
  const after = (ms: number, name: string) =>
    new Promise<void>((settle) =>
      setTimeout(() => {
        mark(name);
        settle();
      }, ms),
    );

  const backend: BackendApi = {
    state: {
      connectionStatus: "connected",
      serverConfig: null,
      providers: [],
      error: null,
    },
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    orchestration: Object.assign(createRecordingOrchestrationApi(), {
      createThread: vi.fn(async () => {
        await after(input.createThreadMs, "thread.create");
      }),
      startThreadTurn: vi.fn(async () => {
        await after(input.createThreadMs + input.contextSyncMs + input.toolSyncMs, "turn.start");
      }),
    }),
    launchRecipeWorkflow: vi.fn(async () => {
      await after(input.launchMs, "launch");
      return { ok: true };
    }),
    submitRecipeCardAction: vi.fn(async () => ({ ok: true })),
    resolveWorkflowInput: vi.fn(async () => undefined),
    listThreadPlacements: vi.fn(async () => []),
    syncThreadToolContext: vi.fn(async () => {
      await after(input.toolSyncMs, "tool-sync");
    }),
    atlassian: {} as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {
      bootstrapWorkspace: vi.fn(async () => {
        throw new Error("not used");
      }),
      readLinkedRepositoryStatus: vi.fn(async () => ({ linkedRepositories: [] })),
      setMainRepository: vi.fn(async () => {
        throw new Error("not used");
      }),
      discoverRecipes: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        hasProjectLocalRecipes: false,
        recipes: [],
      })),
      writeContextFiles: vi.fn(async () => {
        await after(input.contextSyncMs, "context-refresh");
        return {
          workspaceRoot: "/tmp/project-alpha",
          writtenFiles: [".t3team/context/misc/project-alpha/context/entrypoint.json"],
        };
      }),
      refreshWorkItemContext: vi.fn(async () => ({
        ok: true,
        status: "already_synced" as const,
        projectId: "project-alpha",
        ticketKey: "PRJ-1",
        availability: "full" as const,
        entryPointRelativePath: ".t3team/context/jira/project-alpha/items/prj-1/entrypoint.json",
        manifestRelativePath: ".t3team/context/jira/project-alpha/items/prj-1/manifest.json",
        includedCount: 0,
        skippedCount: 0,
      })),
      refreshWorkItemSliceContext: vi.fn(async () => ({
        ok: true,
        status: "already_synced" as const,
        projectId: "project-alpha",
        ticketKey: "PRJ-1",
        focusKind: "comments" as const,
        availability: "full" as const,
        focusEntryPointRelativePath:
          ".t3team/context/jira/project-alpha/items/prj-1/focus/comments.json",
        entryPointRelativePath: ".t3team/context/jira/project-alpha/items/prj-1/entrypoint.json",
        includedCount: 0,
        skippedCount: 0,
      })),
      syncLinkedRepository: vi.fn(async () => {
        throw new Error("not used");
      }),
      listLinkedRepositoryBranches: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
  };
  return { calls, backend };
}

beforeAll(() => {
  useT3TeamAddToChatStore.setState({
    pendingByProjectId: {},
    pendingByKickoffKey: {},
    threadAttachmentsByThreadId: {},
  });
});

describe("kickoff preparation chain (timing)", () => {
  it("workflow kickoff: the shell arrives right after thread.create, long before the launch", async () => {
    const { calls, backend } = createLatencyBackend({
      createThreadMs: 40,
      contextSyncMs: 2_400,
      toolSyncMs: 30,
      launchMs: 120,
    });
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "ctx-timing" });
    registerContextAttachmentRequest(pendingAttachment.id, request);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment("thread-timing-wf", pendingAttachment);

    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-timing-wf",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "QA plan",
      initialUserMessage: "Build the QA plan for PRJ-1",
      kickoffModelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      kickoffBranch: null,
      kickoffWorkflow: WORKFLOW,
      createdAt: "2026-10-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: freshState("thread-timing-wf"),
      onInitialUserMessageSent: undefined,
    });

    // The thread content shows the moment the shell exists (tens of ms), while the whole chain
    // takes >2.6s: the launch is serialized AFTER the context refresh.
    const callMs = (name: string) =>
      Number(
        calls
          .find((call) => call.startsWith(`${name}+`))
          ?.split("+")[1]
          ?.slice(0, -2),
      );
    const indexOf = (name: string) => calls.findIndex((call) => call.startsWith(`${name}+`));
    expect(indexOf("thread.create")).toBe(0);
    expect(callMs("thread.create")).toBeLessThan(200);
    expect(callMs("context-refresh")).toBeGreaterThan(1_000);
    expect(indexOf("launch")).toBeGreaterThan(indexOf("context-refresh"));
  }, 15_000);
});

describe("per-step progress reports", () => {
  it("reports create done while the context step is still busy: the thread exists before prep resolves", async () => {
    const { backend } = createLatencyBackend({
      createThreadMs: 20,
      contextSyncMs: 400,
      toolSyncMs: 10,
      launchMs: 50,
    });
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "ctx-progress" });
    registerContextAttachmentRequest(pendingAttachment.id, request);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment("thread-progress-wf", pendingAttachment);

    const reported: ThreadBootstrapProgress[] = [];

    let contextBusyWhileCreateDone = false;
    await runThreadBootstrap({
      backend,
      environmentId: "env-1",
      threadId: "thread-progress-wf",
      projectTitle: "Project Alpha",
      projectWorkspaceRoot: "/tmp/project-alpha",
      canonicalProjectId: "project-alpha",
      title: "QA plan",
      initialUserMessage: "Build the QA plan for PRJ-1",
      kickoffModelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      kickoffBranch: null,
      kickoffWorkflow: WORKFLOW,
      createdAt: "2026-10-19T12:00:00.000Z",
      shouldEnsureProject: false,
      action: "kickoff",
      state: freshState("thread-progress-wf"),
      onInitialUserMessageSent: undefined,
      onProgress: (progress) => {
        reported.push(progress);
        const create = progress.steps.find((step) => step.id === "create");
        const context = progress.steps.find((step) => step.id === "context");
        if (create?.status === "done" && context?.status === "busy") {
          contextBusyWhileCreateDone = true;
        }
      },
    });

    expect(contextBusyWhileCreateDone).toBe(true);
    const last = reported.at(-1);
    expect(last?.steps.map((step) => [step.id, step.status])).toEqual([
      ["create", "done"],
      ["context", "done"],
      ["launch", "done"],
    ]);
  }, 15_000);

  it("marks the failed step with its error and leaves earlier steps done", async () => {
    const { backend } = createLatencyBackend({
      createThreadMs: 10,
      contextSyncMs: 300,
      toolSyncMs: 10,
      launchMs: 10,
    });
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "ctx-progress-err" });
    registerContextAttachmentRequest(pendingAttachment.id, request);
    useT3TeamAddToChatStore
      .getState()
      .enqueueThreadAttachment("thread-progress-err", pendingAttachment);
    vi.mocked(backend.projectWorkspace.writeContextFiles).mockRejectedValueOnce(
      new Error("Context refresh timed out."),
    );

    let progress: ThreadBootstrapProgress | undefined;
    await expect(
      runThreadBootstrap({
        backend,
        environmentId: "env-1",
        threadId: "thread-progress-err",
        projectTitle: "Project Alpha",
        projectWorkspaceRoot: "/tmp/project-alpha",
        canonicalProjectId: "project-alpha",
        title: "QA plan",
        initialUserMessage: "Build the QA plan for PRJ-1",
        kickoffModelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
        kickoffRuntimeMode: "full-access",
        kickoffInteractionMode: "default",
        kickoffBranch: null,
        kickoffWorkflow: WORKFLOW,
        createdAt: "2026-10-19T12:00:00.000Z",
        shouldEnsureProject: false,
        action: "kickoff",
        state: freshState("thread-progress-err"),
        onInitialUserMessageSent: undefined,
        onProgress: (next) => {
          progress = next;
        },
      }),
    ).rejects.toThrow("Context refresh timed out.");

    expect(progress?.steps.map((step) => [step.id, step.status, step.error])).toEqual([
      ["create", "done", undefined],
      ["context", "error", expect.stringContaining("Context refresh timed out.")],
      ["launch", "pending", undefined],
    ]);
  }, 15_000);
});

describe("pre-shell view (after the change)", () => {
  it("is not a blocking panel: the first message and the live steps render before the shell", () => {
    const markup = renderToStaticMarkup(
      body("local-thread-after", {
        hasServerThread: false,
        bootstrapStatus: "running",
        bootstrapProgress: {
          steps: [
            { id: "create", status: "busy" },
            { id: "context", status: "pending" },
            { id: "launch", status: "pending" },
          ],
        },
        kickoffMessage: "Fix the login regression",
      }),
    );

    // The prompt is the first user message, the steps are inline, and nothing blocks the panel.
    expect(markup).toContain("Fix the login regression");
    expect(markup).toContain("Creating the conversation");
    expect(markup).toContain("Preparing context");
    expect(markup).toContain("Starting the run");
    expect(markup).not.toContain("Creating thread...");
    expect(markup).not.toContain('data-testid="chat-view"');
  });
});
