/**
 * Which My Work kickoffs send at click time, through the real `useAppHandlers` + `useProjectStore`
 * wiring: only a plain-text send, and only while `MYWORK_KICKOFF_SEND_NOW` is on. Everything else
 * keeps the two-phase kickoff, where the thread's chat sends when it mounts.
 */
import { ProviderInstanceId } from "@t3tools/contracts";
import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import { ProjectShellProject } from "@t3tools/project-context";
import * as Schema from "effect/Schema";
import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { clearExternalThreadBootstrapRuns } from "~/t3team/chat/t3team-threadBootstrapExternalRun";
import { clearThreadBootstrapDispatchStates } from "~/t3team/chat/t3team-threadBootstrapDispatchRegistry";
import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import type { ProjectKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import { useAppHandlers } from "~/t3team/t3team-useAppHandlers";

vi.mock("~/localApi", () => ({ readLocalApi: () => null }));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => "env-1" }));
vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  readProjects: () => [],
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => harness.backend,
  useBackendState: () => ({ connectionStatus: "connected" }),
}));
vi.mock("~/t3team/t3team-serverState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/t3team/t3team-serverState")>()),
  readPrimaryServerConfig: () => harness.serverConfig,
}));
vi.mock("~/hooks/useThreadActions", () => {
  const deleteThread = vi.fn();
  return { useThreadActions: () => ({ deleteThread }) };
});
vi.mock("~/t3team/hooks/t3team-useLocalWorkspaceCommands", () => {
  const noop = () => {};
  return {
    useLocalWorkspaceCommands: () => ({ handleDeleteProject: noop, handleRenameProject: noop }),
  };
});

const harness = vi.hoisted(() => ({
  backend: null as BackendApi | null,
  serverConfig: null as { featureFlags: Record<string, boolean> } | null,
}));

const PROJECT_ID = "project-1";
const MESSAGE = "What is blocking my sprint?";
const startThreadTurn = vi.fn(async (_input: StartThreadTurnInput) => undefined);
const onOpenDashboard = vi.fn();

let latest: {
  store: ReturnType<typeof useProjectStore>;
  handlers: ReturnType<typeof useAppHandlers>;
} | null = null;

function Harness() {
  const store = useProjectStore();
  const handlers = useAppHandlers({
    store,
    activeView: { type: "all-my-work" },
    onOpenHome: undefined,
    onOpenDashboard,
    onOpenTicket: undefined,
    onOpenThread: undefined,
  });
  useLayoutEffect(() => {
    latest = { store, handlers };
  });
  return null;
}

const decodeProject = Schema.decodeUnknownSync(ProjectShellProject);

/** Also resets the module-level registries and mocks a previous case left behind. */
async function mount(serverConfig: { featureFlags: Record<string, boolean> } | null) {
  clearThreadBootstrapDispatchStates();
  clearExternalThreadBootstrapRuns();
  startThreadTurn.mockClear();
  onOpenDashboard.mockClear();
  latest = null;
  harness.serverConfig = serverConfig;
  harness.backend = {
    ...createMockBackend(),
    orchestration: { ...createMockBackend().orchestration, startThreadTurn },
    syncThreadToolContext: vi.fn(async () => undefined),
  };
  const screen = await render(<Harness />, { router: false });
  await act(async () => {
    latest?.store.addProject(
      decodeProject({
        id: PROJECT_ID,
        title: "Scratch",
        source: { provider: "local" },
        createdAt: "2026-10-23T00:00:00.000Z",
        updatedAt: "2026-10-23T00:00:00.000Z",
      }),
    );
  });
  return screen;
}

function kickoffInput(overrides: Partial<ProjectKickoffThreadInput>): ProjectKickoffThreadInput {
  return {
    projectId: PROJECT_ID,
    dashboardMode: "my-work",
    kickoffMessage: MESSAGE,
    kickoffModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    kickoffRuntimeMode: "full-access",
    kickoffInteractionMode: "default",
    selectedToolIds: [],
    kickoffContextAttachments: [],
    ...overrides,
  };
}

async function sendKickoff(overrides: Partial<ProjectKickoffThreadInput>) {
  let threadId = "";
  await act(async () => {
    threadId = latest?.handlers.handleCreateProjectKickoffThread(kickoffInput(overrides)) ?? "";
  });
  return threadId;
}

describe("handleCreateProjectKickoffThread", () => {
  it("sends a plain-text kickoff at click time and still opens the thread", async () => {
    await using _app = await mount(null);

    const threadId = await sendKickoff({ kickoffPending: true, sendAtClick: true });

    await vi.waitFor(() => expect(startThreadTurn).toHaveBeenCalledTimes(1));
    const [call] = startThreadTurn.mock.calls[0] ?? [];
    expect(String(call?.threadId)).toBe(threadId);
    expect(call?.message.text).toBe(MESSAGE);
    expect(call?.bootstrap?.createThread?.projectId).toBe(PROJECT_ID);
    expect(onOpenDashboard).toHaveBeenCalledWith(PROJECT_ID, "my-work", threadId);
    await vi.waitFor(() =>
      expect(latest?.store.threads.find((t) => t.id === threadId)?.kickoffPending).toBe(false),
    );
  });

  it("keeps the two-phase kickoff while the flag is off", async () => {
    await using _app = await mount({ featureFlags: { MYWORK_KICKOFF_SEND_NOW: false } });

    const threadId = await sendKickoff({ kickoffPending: true, sendAtClick: true });

    expect(startThreadTurn).not.toHaveBeenCalled();
    expect(onOpenDashboard).toHaveBeenCalledWith(PROJECT_ID, "my-work", threadId);
    expect(latest?.store.threads.find((t) => t.id === threadId)).toMatchObject({
      kickoffMessage: MESSAGE,
      kickoffPending: true,
    });
  });

  it("leaves a recipe or Quick Start kickoff to its own launcher", async () => {
    await using _app = await mount(null);

    const threadId = await sendKickoff({ kickoffPending: true });

    expect(startThreadTurn).not.toHaveBeenCalled();
    expect(latest?.store.threads.find((t) => t.id === threadId)?.kickoffPending).toBe(true);
  });
});
