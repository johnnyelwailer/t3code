import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackendApi } from "~/t3work/backend/t3work-types";
import { runThreadBootstrap } from "~/t3work/chat/t3work-runThreadBootstrap";
import {
  buildPendingContextAttachment,
  type AddToChatRequest,
} from "~/t3work/t3work-addToChatUtils";
import { useT3WorkAddToChatStore } from "~/t3work/t3work-addToChatStore";
import { registerContextAttachmentRequest } from "~/t3work/t3work-contextAttachmentSync";

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
    atlassian: {} as BackendApi["atlassian"],
    github: {} as BackendApi["github"],
    projectWorkspace: {
      bootstrapWorkspace: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        workspaceRepositoryInitialized: true,
        referencesRoot: "/tmp/project-alpha/.t3work/references",
        linkedRepositories: [],
      })),
      writeContextFiles: vi.fn(async () => ({
        workspaceRoot: "/tmp/project-alpha",
        writtenFiles: [".t3work/context-cache/misc/project-alpha/context/entrypoint.json"],
      })),
    },
    subscribeConfig: vi.fn(() => () => undefined),
    subscribeLifecycle: vi.fn(() => () => undefined),
    subscribeShell: vi.fn(() => () => undefined),
    subscribeThread: vi.fn(() => () => undefined),
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
  useT3WorkAddToChatStore.setState({
    pendingByProjectId: {},
    pendingByKickoffKey: {},
    threadAttachmentsByThreadId: {},
  });
});

describe("runThreadBootstrap", () => {
  it("includes queued thread context in kickoff messages and clears it after success", async () => {
    const backend = createBackend();
    useT3WorkAddToChatStore.getState().enqueueThreadAttachment("thread-1", {
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

    expect(backend.dispatchCommand).toHaveBeenCalledTimes(1);
    expect(backend.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.turn.start",
        message: expect.objectContaining({
          text: "### Added Context: Open PR\n\nTell me something about this",
        }),
      }),
    );
    expect(useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId["thread-1"]).toBe(
      undefined,
    );
    expect(onInitialUserMessageSent).toHaveBeenCalledOnce();
  });

  it("refreshes registered thread context before kickoff sends", async () => {
    const backend = createBackend();
    const request = createRequest();
    const pendingAttachment = buildPendingContextAttachment({ request, id: "ctx-2" });
    registerContextAttachmentRequest(pendingAttachment.id, request);
    useT3WorkAddToChatStore.getState().enqueueThreadAttachment("thread-2", pendingAttachment);

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

    expect(backend.projectWorkspace.writeContextFiles).toHaveBeenCalledTimes(1);
    expect(backend.dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: expect.stringContaining("Open PR"),
        }),
      }),
    );
    expect(useT3WorkAddToChatStore.getState().threadAttachmentsByThreadId["thread-2"]).toBe(
      undefined,
    );
  });
});
