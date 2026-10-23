/**
 * A plain-text My Work kickoff used to leave its first message to the thread chat's mount effect, so
 * a chat that never mounted left an empty thread and no error. These cases pin the click-time send:
 * one atomic `thread.turn.start`, no second send from the chat that mounts later (the mount effect's
 * own `runThreadBootstrapEffect` is driven here), and no thread when the call fails.
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { ProjectShellProject } from "@t3tools/project-context";
import * as Schema from "effect/Schema";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { runThreadBootstrapEffect } from "~/t3team/chat/t3team-runThreadBootstrapEffect";
import {
  clearExternalThreadBootstrapRuns,
  readExternalThreadBootstrapRun,
} from "~/t3team/chat/t3team-threadBootstrapExternalRun";
import {
  clearThreadBootstrapDispatchStates,
  resetThreadBootstrapDispatchState,
} from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { sendKickoffAtClick } from "~/t3team/t3team-sendKickoffAtClick";
import type { ProjectThread } from "~/t3team/t3team-types";

const THREAD_ID = "thread-kickoff-1";
const MESSAGE = "Summarise what changed on my open PRs";
const model = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };
const decodeProject = Schema.decodeUnknownSync(ProjectShellProject);

const project = decodeProject({
  id: "project-1",
  title: "Scratch",
  source: { provider: "local" },
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
});

function kickoffThread(): ProjectThread {
  return {
    id: THREAD_ID,
    projectId: project.id,
    title: "Project kickoff",
    lastMessageAt: "2026-10-23T00:00:00.000Z",
    createdAt: "2026-10-23T00:00:00.000Z",
    status: "idle",
    kickoffMessage: MESSAGE,
    kickoffPending: true,
    kickoffModelSelection: model,
    kickoffRuntimeMode: "full-access",
    kickoffInteractionMode: "default",
    selectedToolIds: [],
  };
}

function createBackend(startThreadTurn: (input: StartThreadTurnInput) => Promise<void>) {
  const base = createMockBackend();
  const createThread = vi.fn(async () => undefined);
  const backend: BackendApi = {
    ...base,
    orchestration: { ...base.orchestration, createThread, startThreadTurn },
    syncThreadToolContext: vi.fn(async () => undefined),
  };
  return { backend, createThread };
}

function sendAtClick(backend: BackendApi | null) {
  const markKickoffConsumed = vi.fn();
  const sent = sendKickoffAtClick({
    backend,
    environmentId: "env-1",
    project,
    thread: kickoffThread(),
    liveProjects: [],
    markKickoffConsumed,
  });
  return { sent, markKickoffConsumed };
}

/** One pass of the thread chat's mount effect, as it plans before any server shell exists. */
function mountEffect(backend: BackendApi, initialUserMessage: string | undefined) {
  const updateBootstrapStatus = vi.fn();
  runThreadBootstrapEffect({
    backend,
    environmentId: "env-1",
    threadId: THREAD_ID,
    projectTitle: project.title,
    projectWorkspaceRoot: undefined,
    canonicalProjectId: project.id,
    projectExists: false,
    title: "Project kickoff",
    initialUserMessage,
    initialModelSelection: model,
    initialRuntimeMode: "full-access",
    initialInteractionMode: "default",
    initialBranch: undefined,
    kickoffWorkflow: undefined,
    initialToolContext: undefined,
    onInitialUserMessageSent: undefined,
    serverThread: null,
    updateBootstrapProgress: vi.fn(),
    updateBootstrapStatus,
  });
  return updateBootstrapStatus;
}

beforeEach(() => {
  clearThreadBootstrapDispatchStates();
  clearExternalThreadBootstrapRuns();
});

describe("sendKickoffAtClick", () => {
  it("creates the thread and sends the first message in one call before any chat mounts", async () => {
    const startThreadTurn = vi.fn(async (_input: StartThreadTurnInput) => undefined);
    const { backend, createThread } = createBackend(startThreadTurn);

    const { sent, markKickoffConsumed } = sendAtClick(backend);

    expect(sent).toBe(true);
    await vi.waitFor(() => expect(markKickoffConsumed).toHaveBeenCalledWith(THREAD_ID));
    expect(startThreadTurn).toHaveBeenCalledTimes(1);
    const [call] = startThreadTurn.mock.calls[0] ?? [];
    expect(call?.message.text).toBe(MESSAGE);
    expect(call?.bootstrap?.createThread).toMatchObject({
      projectId: project.id,
      title: "Project kickoff",
    });
    expect(createThread).not.toHaveBeenCalled();
  });

  it("sends nothing and leaves delivery to the chat when the dispatch is not ready", () => {
    const startThreadTurn = vi.fn(async (_input: StartThreadTurnInput) => undefined);
    createBackend(startThreadTurn);

    const { sent } = sendAtClick(null);

    expect(sent).toBe(false);
    expect(startThreadTurn).not.toHaveBeenCalled();
  });

  it("does not send again when the chat mounts while the call is still in flight", async () => {
    let finish: () => void = () => undefined;
    const startThreadTurn = vi.fn(
      (_input: StartThreadTurnInput) => new Promise<void>((resolve) => (finish = resolve)),
    );
    const { backend, createThread } = createBackend(startThreadTurn);

    sendAtClick(backend);
    await vi.waitFor(() => expect(startThreadTurn).toHaveBeenCalledTimes(1));
    const status = mountEffect(backend, MESSAGE);

    expect(status).toHaveBeenLastCalledWith("running");
    expect(readExternalThreadBootstrapRun(THREAD_ID)?.status).toBe("running");
    expect(
      readExternalThreadBootstrapRun(THREAD_ID)?.progress?.steps.map((step) => step.status),
    ).toContain("busy");

    finish();
    await vi.waitFor(() => expect(readExternalThreadBootstrapRun(THREAD_ID)?.status).toBe("idle"));
    expect(startThreadTurn).toHaveBeenCalledTimes(1);
    expect(createThread).not.toHaveBeenCalled();
  });

  it("does not create a bare thread when the chat re-renders after the kickoff was consumed", async () => {
    const startThreadTurn = vi.fn(async (_input: StartThreadTurnInput) => undefined);
    const { backend, createThread } = createBackend(startThreadTurn);

    const { markKickoffConsumed } = sendAtClick(backend);
    await vi.waitFor(() => expect(markKickoffConsumed).toHaveBeenCalled());
    mountEffect(backend, undefined);

    expect(startThreadTurn).toHaveBeenCalledTimes(1);
    expect(createThread).not.toHaveBeenCalled();
  });

  it("creates no thread when the call fails, reports the failure, and retries once", async () => {
    const startThreadTurn = vi
      .fn<(input: StartThreadTurnInput) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Gateway unavailable"))
      .mockResolvedValue(undefined);
    const { backend, createThread } = createBackend(startThreadTurn);

    const { markKickoffConsumed } = sendAtClick(backend);
    await vi.waitFor(() =>
      expect(readExternalThreadBootstrapRun(THREAD_ID)?.status).toBe("failed"),
    );
    const status = mountEffect(backend, MESSAGE);

    expect(status).toHaveBeenLastCalledWith("failed");
    expect(createThread).not.toHaveBeenCalled();
    expect(markKickoffConsumed).not.toHaveBeenCalled();
    expect(startThreadTurn).toHaveBeenCalledTimes(1);
    expect(
      readExternalThreadBootstrapRun(THREAD_ID)?.progress?.steps.find(
        (step) => step.status === "error",
      )?.error,
    ).toBe("Gateway unavailable");

    resetThreadBootstrapDispatchState(THREAD_ID);
    expect(readExternalThreadBootstrapRun(THREAD_ID)).toBeUndefined();
    mountEffect(backend, MESSAGE);
    await vi.waitFor(() => expect(startThreadTurn).toHaveBeenCalledTimes(2));
    expect(createThread).not.toHaveBeenCalled();
  });
});
