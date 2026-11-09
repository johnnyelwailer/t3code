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
  threadShells: null as unknown as import("effect/reactivity").Atom.Writable<
    ReadonlyArray<unknown>
  >,
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
  state.threadShells = Atom.make<ReadonlyArray<unknown>>([]).pipe(Atom.keepAlive);
  return {
    threadEnvironment: {
      startTurn: state.start,
      updateMetadata: vi.fn(),
      setRuntimeMode: vi.fn(),
      setInteractionMode: vi.fn(),
    },
    environmentThreadShells: { threadShellsAtom: state.threadShells },
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
vi.mock("./t3team-followRetargetedThreads", () => ({ followRetargetedThreads: vi.fn() }));
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
import { retargetQueuedCreations } from "./t3team-retargetQueuedCreations";

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
  runtimeMode: "full-access",
  interactionMode: "default",
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

// A follow-up the user sent in the new thread before it existed (the thread screen's composer).
const followUp = (): QueuedThreadMessage => {
  const { creation: _creation, ...message } = queuedOnPlaceholder({
    messageId: MessageId.make("follow-up"),
    commandId: CommandId.make("follow-up-command"),
    text: "Also run the tests",
    createdAt: "2026-11-09T00:01:00.000Z",
  });
  return message;
};
const createdThread = {
  environmentId: "machine",
  id: "new-thread",
  modelSelection: { instanceId: "codex", model: "gpt-5.4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  session: null,
};

beforeEach(() => {
  state.writes = [];
  appAtomRegistry.set(state.threadShells, []);
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
  vi.restoreAllMocks();
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

  it("moves the thread's queued follow-up after its creation and delivers both once", async () => {
    await state.manager.enqueue(followUp());
    await state.manager.enqueue(queuedOnPlaceholder());
    state.writes = [];

    const result = await retargetQueuedCreations(placeholder, real);
    expect(result).toEqual({ complete: true, movedThreadIds: ["new-thread"] });
    expect(state.writes.map((message) => [message.messageId, message.environmentId])).toEqual([
      ["message", "machine"],
      ["follow-up", "machine"],
    ]);

    // The server publishes the new thread's shell when it accepts the creation.
    state.start.mockImplementation(async () => {
      appAtomRegistry.set(state.threadShells, [createdThread]);
      return AsyncResult.success({});
    });
    await drain().settled;
    if (state.start.mock.calls.length < 2) await drain().settled;
    expect(
      state.start.mock.calls.map(([call]) => [call.environmentId, call.input.message.messageId]),
    ).toEqual([
      ["machine", "message"],
      ["machine", "follow-up"],
    ]);
    expect(remaining()).toEqual([]);
  });
});
