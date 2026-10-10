// @vitest-environment jsdom
/**
 * A kickoff started from a ticket beside My Work must stay on My Work and show the new thread in
 * the digest Chat tab — through the real `useAppHandlers` + `useProjectStore` wiring, since the
 * store's `createThread` writes a ticket view that the handler has to undo.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ProjectShellProject } from "@t3tools/project-context";

import { useProjectStore } from "~/t3team/hooks/t3team-useProjectStore";
import { useDigestChatThreadStore } from "~/t3team/t3team-digestChatThread";
import { useAppHandlers } from "~/t3team/t3team-useAppHandlers";
import type { ViewState } from "~/t3team/t3team-types";

vi.mock("~/localApi", () => ({ readLocalApi: () => null }));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => null }));
vi.mock("~/state/entities", () => ({
  useProjects: () => emptyArray,
  useThreadShells: () => emptyArray,
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => null,
  useBackendState: () => backendState,
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

const { emptyArray, backendState } = vi.hoisted(() => ({
  emptyArray: [] as unknown[],
  backendState: { connectionStatus: "disconnected" as const },
}));

const PROJECT_ID = "project-1";

let latest: {
  store: ReturnType<typeof useProjectStore>;
  handlers: ReturnType<typeof useAppHandlers>;
} | null = null;

function Harness({ activeView }: { activeView: ViewState }) {
  const store = useProjectStore();
  const handlers = useAppHandlers({
    store,
    activeView,
    onOpenHome: undefined,
    onOpenDashboard: undefined,
    onOpenTicket: vi.fn(),
    onOpenThread: vi.fn(),
  });
  latest = { store, handlers };
  return null;
}

async function mount(activeView: ViewState) {
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness activeView={activeView} />);
  });
  await act(async () => {
    latest!.store.addProject({
      id: PROJECT_ID,
      title: "Test Project",
      source: { provider: "local", raw: {} },
    } as unknown as ProjectShellProject);
  });
  return latest!;
}

async function kickoffBeside() {
  let threadId = "";
  await act(async () => {
    threadId = latest!.handlers.handleCreateTicketKickoffThreadBeside({
      projectId: PROJECT_ID,
      ticketId: "ticket-9",
      ticketDisplayId: "PROJ-9",
      githubActivityItems: [],
      kickoffMessage: "Plan the QA pass",
      kickoffModelSelection: { instanceId: "codex" as never, model: "gpt-5.4" },
      kickoffRuntimeMode: "full-access",
      kickoffInteractionMode: "default",
      selectedToolIds: [],
      kickoffContextAttachments: [],
    });
  });
  return threadId;
}

describe("handleCreateTicketKickoffThreadBeside", () => {
  beforeEach(() => {
    latest = null;
    useDigestChatThreadStore.setState({ projectId: null, ticketId: null, threadId: null });
  });

  it("keeps My Work open and pins the new thread for the digest Chat tab", async () => {
    await mount({ type: "all-my-work" });

    const threadId = await kickoffBeside();

    expect(threadId).not.toBe("");
    expect(useDigestChatThreadStore.getState()).toEqual({
      projectId: PROJECT_ID,
      ticketId: "ticket-9",
      threadId,
    });
    expect(latest!.store.view).toEqual({ type: "all-my-work" });
    const thread = latest!.store.threads.find((candidate) => candidate.id === threadId);
    expect(thread).toMatchObject({ kickoffPending: true, kickoffMessage: "Plan the QA pass" });
  });

  it("keeps the project dashboard and its embedded thread instead of the ticket view", async () => {
    const dashboard: ViewState = {
      type: "dashboard",
      projectId: PROJECT_ID,
      embeddedThreadId: "thread-kept",
    };
    await mount(dashboard);

    const threadId = await kickoffBeside();

    expect(useDigestChatThreadStore.getState().threadId).toBe(threadId);
    expect(latest!.store.view).toEqual(dashboard);
  });
});
