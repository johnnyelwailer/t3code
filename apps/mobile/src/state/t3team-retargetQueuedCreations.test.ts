import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { QueuedThreadMessage } from "./thread-outbox-model";

// The delivery harness of threadOutboxDelivery.permissions.test.ts: one connected machine
// ("machine"); the placeholder environment a pending draft is stamped to is not in the catalog.
const state = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  start: vi.fn(),
  prepare: vi.fn(),
  writes: [] as Array<QueuedThreadMessage>,
  manager: null as unknown as ReturnType<
    typeof import("./thread-outbox-manager").createThreadOutboxManager
  >,
  config: {
    shellThreadFamilies: false,
    providers: [{ instanceId: "codex", driver: "codex" }],
    environment: { capabilities: {} },
  },
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@t3tools/client-runtime/state/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/client-runtime/state/runtime")>()),
  runAtomCommand: (_registry: unknown, command: (input: unknown) => unknown, input: unknown) =>
    command(input),
}));
vi.mock("./session", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    environmentSession: { sessionStateAtom: () => Atom.make(true) },
    sessionHasScope: () => true,
    readEnvironmentScope: () => true,
  };
});
vi.mock("./projects", async () => {
  const { Atom } = await import("effect/reactivity");
  // The overlay retargets once the catalog lists the machine's project.
  const project = { environmentId: "machine", id: "repo", title: "Repo", workspaceRoot: "/repo" };
  return { environmentProjects: { projectsAtom: Atom.make([project]) } };
});
vi.mock("./workspace", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    workspaceConnections: {
      environmentsAtom: Atom.make([{ environmentId: "machine", connectionState: "connected" }]),
    },
  };
});
vi.mock("./server", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    serverEnvironment: { configValueAtom: Atom.family((_id: string) => Atom.make(state.config)) },
    environmentServerConfigsAtom: Atom.make(new Map([["machine", state.config]])),
  };
});
vi.mock("./threads", async () => {
  const { Atom, AsyncResult } = await import("effect/reactivity");
  return {
    threadEnvironment: {
      startTurn: state.start,
      updateMetadata: vi.fn(),
      setRuntimeMode: vi.fn(),
      setInteractionMode: vi.fn(),
    },
    environmentThreadShells: { threadShellsAtom: Atom.make([]).pipe(Atom.keepAlive) },
    threadFamilies: {
      mount: () => () => {},
      familyAtom: () => Atom.make(AsyncResult.success({})),
      refresh: vi.fn(),
    },
    environmentThreadDetails: { stateAtom: () => Atom.make(null) },
  };
});
vi.mock("./git", () => ({ gitEnvironment: { preparePullRequestThread: vi.fn() } }));
vi.mock("../lib/modelOptions", () => ({ isModelSelectionUnavailable: () => false }));
vi.mock("../lib/uuid", () => ({ uuidv4: () => "uuid", randomHex: () => "abcd" }));
vi.mock("../lib/attachmentUpload", () => ({ prepareTurnAttachments: state.prepare }));
vi.mock("./thread-outbox", async () => {
  const { createThreadOutboxManager } = await import("./thread-outbox-manager");
  const { appAtomRegistry } = await import("./atom-registry");
  state.manager = createThreadOutboxManager({
    registry: appAtomRegistry,
    storage: {
      load: async () => ({ messages: [], errors: [] }),
      write: async (message) => {
        state.writes.push(message);
      },
      remove: async () => {},
    },
  });
  return {
    threadOutboxManager: state.manager,
    threadOutboxRevision: (id: MessageId) => state.manager.revisionOf(id),
    confirmThreadOutboxMessageQueued: (message: QueuedThreadMessage) =>
      state.manager.confirmQueued(message),
    updateThreadOutboxMessage: (message: QueuedThreadMessage, revision?: number) =>
      state.manager.update(message, revision),
  };
});
vi.mock("./thread-outbox-removal", () => ({
  removeThreadOutboxMessage: (message: QueuedThreadMessage, revision?: number) =>
    state.manager.remove(message, revision),
}));
vi.mock("./use-thread-outbox", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    editingQueuedMessageIdsAtom: Atom.make({}).pipe(Atom.keepAlive),
    dispatchingQueuedMessageIdAtom: Atom.make<MessageId | null>(null).pipe(Atom.keepAlive),
    threadOutboxShellStatusesAtom: Atom.make(new Map([["machine", "live"]])),
  };
});
vi.mock("./use-composer-drafts", async () => {
  const { Atom } = await import("effect/reactivity");
  return {
    composerDraftsAtom: Atom.make({}),
    removeDeliveredCloudQueuedMessage: async () => {},
    flushComposerDrafts: vi.fn(),
    getComposerDraftSnapshot: vi.fn(() => ({ text: "", attachments: [] })),
    updateComposerDraftSettings: vi.fn(),
    waitForComposerDraftsLoaded: vi.fn(),
  };
});

import { appAtomRegistry } from "./atom-registry";
import { dispatchingQueuedMessageIdAtom } from "./use-thread-outbox";
import { createThreadOutboxDelivery } from "./threadOutboxDelivery";
import { retargetQueuedCreation, retargetQueuedCreations } from "./t3team-retargetQueuedCreations";

const placeholder = {
  environmentId: EnvironmentId.make("pending-env"),
  projectId: ProjectId.make("pending-project"),
};
const real = { environmentId: EnvironmentId.make("machine"), projectId: ProjectId.make("repo") };

const queuedOnPlaceholder = (
  overrides: Partial<QueuedThreadMessage> = {},
): QueuedThreadMessage => ({
  environmentId: placeholder.environmentId,
  threadId: ThreadId.make("new-thread"),
  commandId: CommandId.make("command"),
  messageId: MessageId.make("message"),
  text: "Fix the build",
  attachments: [],
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  creation: {
    projectId: placeholder.projectId,
    projectTitle: "Repo",
    workspaceMode: "local",
    branch: null,
    worktreePath: null,
  },
  createdAt: "2026-11-09T00:00:00.000Z",
  ...overrides,
});
const remaining = () =>
  Object.values(appAtomRegistry.get(state.manager.queuedMessagesByThreadKeyAtom)).flat();

function drain(): { readonly settled: Promise<void> } {
  const settled = Promise.withResolvers<void>();
  const release = appAtomRegistry.subscribe(dispatchingQueuedMessageIdAtom, (id) => {
    if (id === null) settled.resolve();
  });
  const delivery = createThreadOutboxDelivery();
  state.cleanups.push(release, () => delivery.dispose());
  delivery.drain();
  return { settled: settled.promise };
}

beforeEach(() => {
  state.writes = [];
  appAtomRegistry.set(state.manager.queuedMessagesByThreadKeyAtom, {});
  appAtomRegistry.set(dispatchingQueuedMessageIdAtom, null);
  state.start.mockReset().mockResolvedValue(AsyncResult.success({}));
  state.prepare.mockReset().mockImplementation(async ({ attachments }) => ({
    status: "ready",
    attachments: [],
    draftAttachments: attachments,
    pendingAttachmentIds: [],
  }));
});

afterEach(() => {
  state.cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe("retargetQueuedCreations", () => {
  it("delivers a message queued on a placeholder once, on the real machine, after retarget", async () => {
    await state.manager.enqueue(queuedOnPlaceholder());
    drain();
    await Promise.resolve();
    expect(state.start).not.toHaveBeenCalled();

    await retargetQueuedCreations(placeholder, real);
    expect(remaining()).toHaveLength(1);
    expect(state.writes.at(-1)).toMatchObject({
      environmentId: "machine",
      creation: { projectId: "repo" },
    });

    await drain().settled;
    expect(state.start).toHaveBeenCalledOnce();
    expect(state.start.mock.calls[0]?.[0]).toMatchObject({
      environmentId: "machine",
      input: { threadId: "new-thread", bootstrap: { createThread: { projectId: "repo" } } },
    });
    expect(remaining()).toEqual([]);

    drain();
    await Promise.resolve();
    expect(state.start).toHaveBeenCalledOnce();
  });

  it("leaves messages queued on other projects alone", async () => {
    const other = queuedOnPlaceholder({
      messageId: MessageId.make("other"),
      creation: { ...queuedOnPlaceholder().creation!, projectId: ProjectId.make("elsewhere") },
    });
    await state.manager.enqueue(other);
    await retargetQueuedCreations(placeholder, real);
    expect(remaining()).toEqual([other]);
  });
});

describe("retargetQueuedCreation", () => {
  it("moves the thread target and project, dropping the placeholder's workspace path", () => {
    const moved = retargetQueuedCreation(
      queuedOnPlaceholder({
        creation: { ...queuedOnPlaceholder().creation!, projectCwd: "/placeholder" },
      }),
      placeholder,
      real,
    );
    expect(moved?.environmentId).toBe("machine");
    expect(moved?.threadId).toBe("new-thread");
    expect(moved?.creation).toEqual({
      projectId: "repo",
      projectTitle: "Repo",
      workspaceMode: "local",
      branch: null,
      worktreePath: null,
    });
  });

  it("returns null for a follow-up message or another placeholder", () => {
    const { creation: _creation, ...followUp } = queuedOnPlaceholder();
    expect(retargetQueuedCreation(followUp, placeholder, real)).toBeNull();
    expect(
      retargetQueuedCreation(
        queuedOnPlaceholder({ environmentId: EnvironmentId.make("other-env") }),
        placeholder,
        real,
      ),
    ).toBeNull();
  });
});
