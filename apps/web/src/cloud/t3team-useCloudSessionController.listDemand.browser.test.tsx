import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { type CloudSession, EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  /** What each `useCloudSessions(enabled)` call was told, newest last. */
  enabledCalls: [] as boolean[],
  /** What the loaded list holds; only read when the list was asked for. */
  loadedSessions: [] as unknown[],
  connectPendingSessionId: null as string | null,
}));

vi.mock("~/state/t3team-cloudSessions", () => ({
  cloudSessionEnvironment: { cancel: "cancel" },
  usePrimaryEnvironmentId: () => "env-primary",
  useCloudSessions: (enabled: boolean) => {
    mocks.enabledCalls.push(enabled);
    return {
      sessions: enabled ? mocks.loadedSessions : [],
      loading: !enabled,
      configured: true,
      historyUrl: null,
      loadError: null,
      rateLimitedUntilMs: null,
    };
  },
}));
vi.mock("~/connection/catalog", () => ({ environmentCatalog: { register: "register" } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/state/environments", () => ({
  useRelayEnvironmentDiscovery: () => ({ environments: new Map() }),
}));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("~/t3team/t3team-useFeatureFlag", () => ({ useFeatureFlag: () => true }));
vi.mock("./t3team-useCanManageRelay", () => ({ useCanManageRelay: () => true }));
vi.mock("./t3team-cloudSessionToast", () => ({ showCloudSessionFailureToast: vi.fn() }));
vi.mock("./t3team-useCloudSessionListRefresh", () => ({
  useCloudSessionListRefresh: () => ({
    refreshCloudSessionList: vi.fn(),
    refreshRelayEnvironments: vi.fn(),
  }),
}));
vi.mock("./t3team-useCloudSessionCreate", () => ({
  useCloudSessionCreate: () => ({
    onCreate: vi.fn(),
    createPending: false,
    createPendingSetup: false,
  }),
}));
vi.mock("./t3team-useCloudSessionConnect", () => ({
  useCloudSessionConnect: () => ({
    connectPendingSessionId: mocks.connectPendingSessionId,
    connectFailure: null,
    requestConnect: vi.fn(),
  }),
}));

import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { failDraftCloudQueuedSend, writeDraftCloudQueuedSend } from "./t3team-cloudQueuedSendStore";
import { setCloudSessionLocal } from "./t3team-cloudSessionLocalStore";
import {
  clearCloudSessionTarget,
  selectCloudSessionCreating,
  selectCloudSessionTarget,
} from "./t3team-cloudSessionTargetStore";
import { acquireCloudSessionListRefresh } from "./t3team-cloudSessionPolling";
import { CLOUD_MENU_HINT_MS, MENU_CLOSE_QUIET_MS } from "./t3team-useCloudSessionListDemand";
import { useCloudSessionController } from "./t3team-useCloudSessionController";

const SCOPE = "draft-a";
const provisioning = { sessionId: "s-1", phase: "starting" } as unknown as CloudSession;

const handle: { controller: ReturnType<typeof useCloudSessionController> | null } = {
  controller: null,
};

function Probe({ scopeKey }: { scopeKey: string | null }) {
  const controller = useCloudSessionController({ scopeKey });
  useEffect(() => {
    handle.controller = controller;
  });
  return null;
}

const mount = (scopeKey: string | null = SCOPE) =>
  render(<Probe scopeKey={scopeKey} />, { router: false });

/** Whether the latest render asked for the session list. */
const listAsked = () => mocks.enabledCalls.at(-1) === true;

const queuedSend = decodeCloudQueuedSend({
  messageId: "msg-1",
  messageText: "go",
  outgoingText: "go",
  titleSeed: "go",
  modelSelection: { instanceId: "codex", model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "s-1",
  sessionLabel: "machine",
  createdAt: "2026-10-13T08:00:00.000Z",
})!;

/** What ChatView does on a queued send: the draft thread, then the record on it. */
function queueOnDraft() {
  const draftId = DraftId.make(SCOPE);
  const projectRef = scopeProjectRef(EnvironmentId.make("env-primary"), ProjectId.make("p"));
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(projectRef, draftId, { threadId: ThreadId.make("t") });
  // A draft has composer state once it holds a prompt; the send then clears it.
  store.setPrompt(draftId, "go");
  expect(writeDraftCloudQueuedSend(draftId, queuedSend)).toBe(true);
  store.setPrompt(draftId, "");
}

/** A clean slate for one test; the shared stores are emptied again when it ends. */
function scenario(): Disposable {
  mocks.enabledCalls.length = 0;
  mocks.loadedSessions = [];
  mocks.connectPendingSessionId = null;
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  return {
    [Symbol.dispose]() {
      handle.controller = null;
      setCloudSessionLocal(null);
      clearCloudSessionTarget(SCOPE);
      clearCloudSessionTarget("draft-other");
    },
  };
}

describe("useCloudSessionController list demand", () => {
  it("does not load the list for a plain local composer", async () => {
    using _scenario = scenario();
    await using _screen = await mount();
    expect(mocks.enabledCalls.length).toBeGreaterThan(0);
    expect(mocks.enabledCalls.every((asked) => !asked)).toBe(true);
  });

  it("loads it while the Run on menu is open, and lets go when it closes", async () => {
    using _scenario = scenario();
    await using _screen = await mount();
    await act(() => handle.controller?.onCloudMenuOpenChange(true));
    expect(listAsked()).toBe(true);
    await act(() => handle.controller?.onCloudMenuOpenChange(false));
    expect(listAsked()).toBe(false);
  });

  it("loads it once the Run on trigger is hinted, and lets go after the hint window", async () => {
    using _scenario = scenario();
    using _timers = fakeTimers();
    await using _screen = await mount();
    expect(listAsked()).toBe(false);
    await act(() => handle.controller?.onCloudMenuHint());
    expect(listAsked()).toBe(true);
    await act(() => vi.advanceTimersByTime(CLOUD_MENU_HINT_MS - 1));
    expect(listAsked()).toBe(true);
    await act(() => vi.advanceTimersByTime(1));
    expect(listAsked()).toBe(false);
  });

  it("counts a hint that starts the load as the refresh, so opening the menu does not refetch", async () => {
    using _scenario = scenario();
    // Far past any earlier refresh, so only this hint can be what holds the gate.
    using _timers = fakeTimers({ now: Date.UTC(2030, 0, 1) });
    await using _screen = await mount();
    await act(() => handle.controller?.onCloudMenuHint());
    expect(acquireCloudSessionListRefresh("env-primary")).toBe(false);
  });

  it("does not hold off the menu's refresh when the list was already asked for", async () => {
    using _scenario = scenario();
    using _timers = fakeTimers({ now: Date.UTC(2031, 0, 1) });
    await using _screen = await mount();
    await act(() => handle.controller?.onPanelVisibilityChange(true));
    await act(() => handle.controller?.onCloudMenuHint());
    expect(acquireCloudSessionListRefresh("env-primary")).toBe(true);
  });

  it("ignores the focus that returns to the trigger as the menu closes", async () => {
    using _scenario = scenario();
    using _timers = fakeTimers({ now: Date.UTC(2032, 0, 1) });
    await using _screen = await mount();
    await act(() => handle.controller?.onCloudMenuOpenChange(true));
    await act(() => handle.controller?.onCloudMenuOpenChange(false));
    await act(() => handle.controller?.onCloudMenuHint());
    expect(listAsked()).toBe(false);
    await act(() => vi.advanceTimersByTime(MENU_CLOSE_QUIET_MS));
    await act(() => handle.controller?.onCloudMenuHint());
    expect(listAsked()).toBe(true);
  });

  it("hands the trigger one stable hint handler across renders", async () => {
    using _scenario = scenario();
    await using screen = await mount();
    const first = handle.controller?.onCloudMenuHint;
    await screen.rerender(<Probe scopeKey={SCOPE} />);
    expect(handle.controller?.onCloudMenuHint).toBe(first);
  });

  it("keeps a hinted list loaded when the menu opens, and still loads without a hint", async () => {
    using _scenario = scenario();
    using _timers = fakeTimers();
    await using _screen = await mount();
    await act(() => handle.controller?.onCloudMenuHint());
    await act(() => handle.controller?.onCloudMenuOpenChange(true));
    await act(() => vi.advanceTimersByTime(CLOUD_MENU_HINT_MS));
    expect(listAsked()).toBe(true);
    await act(() => handle.controller?.onCloudMenuOpenChange(false));
    expect(listAsked()).toBe(false);
  });

  it("loads it while a cloud panel is visible", async () => {
    using _scenario = scenario();
    await using _screen = await mount();
    await act(() => handle.controller?.onPanelVisibilityChange(true));
    expect(listAsked()).toBe(true);
    await act(() => handle.controller?.onPanelVisibilityChange(false));
    expect(listAsked()).toBe(false);
  });

  it("loads it once the composer has a Run on target, not for another composer's", async () => {
    using _scenario = scenario();
    await using _screen = await mount();
    await act(() =>
      selectCloudSessionTarget({ scopeKey: "draft-other", sessionId: "s-9", label: "other" }),
    );
    expect(listAsked()).toBe(false);
    await act(() => selectCloudSessionTarget({ scopeKey: SCOPE, sessionId: "s-1", label: "mine" }));
    expect(listAsked()).toBe(true);
    await act(() => clearCloudSessionTarget(SCOPE));
    expect(listAsked()).toBe(false);
  });

  it("loads it while a cloud session create is in flight", async () => {
    using _scenario = scenario();
    await using _screen = await mount(null);
    await act(() => selectCloudSessionCreating("draft-other"));
    expect(listAsked()).toBe(true);
  });

  it("loads it for the app-level flusher while a first message waits for its session", async () => {
    using _scenario = scenario();
    await using _screen = await mount(null);
    expect(listAsked()).toBe(false);
    await act(() => queueOnDraft());
    expect(listAsked()).toBe(true);
  });

  it("loads it for the draft showing a parked failed send, not for another composer", async () => {
    using _scenario = scenario();
    queueOnDraft();
    await act(() =>
      failDraftCloudQueuedSend(DraftId.make(SCOPE), queuedSend.messageId, "no machine", true),
    );
    await using screen = await mount("draft-other");
    expect(listAsked()).toBe(false);
    await screen.rerender(<Probe scopeKey={SCOPE} />);
    expect(listAsked()).toBe(true);
  });

  it("loads it for a session this client created that the server list may not carry yet", async () => {
    using _scenario = scenario();
    await using _screen = await mount();
    await act(() =>
      setCloudSessionLocal({ session: provisioning, knownServerSessionIds: new Set() }),
    );
    expect(listAsked()).toBe(true);
  });

  it("keeps the list loaded after its surface closes while a session still provisions", async () => {
    using _scenario = scenario();
    await using screen = await mount();
    mocks.loadedSessions = [provisioning];
    await act(() => handle.controller?.onCloudMenuOpenChange(true));
    await act(() => handle.controller?.onCloudMenuOpenChange(false));
    expect(listAsked()).toBe(true);
    // The session became ready: nothing is in flight, so the list is let go.
    mocks.loadedSessions = [{ ...provisioning, phase: "ready" }];
    await screen.rerender(<Probe scopeKey={SCOPE} />);
    expect(listAsked()).toBe(false);
  });

  it("keeps the list loaded while a connect to a session is in progress", async () => {
    using _scenario = scenario();
    await using screen = await mount();
    await act(() => handle.controller?.onCloudMenuOpenChange(true));
    mocks.connectPendingSessionId = "s-1";
    await act(() => handle.controller?.onCloudMenuOpenChange(false));
    expect(listAsked()).toBe(true);
    mocks.connectPendingSessionId = null;
    await screen.rerender(<Probe scopeKey={SCOPE} />);
    expect(listAsked()).toBe(false);
  });
});
