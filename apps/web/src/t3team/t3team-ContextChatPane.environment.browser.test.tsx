import { createMemoryHistory } from "@tanstack/react-router";
import { ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import { useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { MY_WORK_PANEL_REF } from "~/rightPanelStore";
import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  emitThreadCreated,
  installFakeEnvironment,
  recordedContextBindings,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

import { contextChatBindingKey, myWorkContextBinding } from "./t3team-contextChatBinding";
import { ContextChatPane } from "./t3team-ContextChatPane";
import { pendingBindingKey, useContextChatPendingStore } from "./t3team-contextChatPendingStore";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});
vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const binding = myWorkContextBinding(PROJECT_ID);
const bindingKey = contextChatBindingKey(ENVIRONMENT_ID, binding);
// Over the app, so the pane is in view whatever the app laid out beneath it.
function aside() {
  const container = document.createElement("div");
  container.style.cssText =
    "position: fixed; top: 0; right: 0; height: 700px; width: 420px; z-index: 9999; background: white;";
  return container;
}
const pane = (
  <AppAtomRegistryProvider>
    <div className="h-full">
      <ContextChatPane
        environmentId={ENVIRONMENT_ID}
        binding={binding}
        hostRef={MY_WORK_PANEL_REF}
      />
    </div>
  </AppAtomRegistryProvider>
);

// Desktop-sized, as the right panel is: the narrow layout swaps the composer for a hidden twin.
await page.viewport(1400, 900);

// Each test starts with no draft and nothing pending, whatever the one before left in the stores.
function freshStores(): Disposable {
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  useContextChatPendingStore.setState({ pending: {}, activeByBindingKey: {} });
  return { [Symbol.dispose]: () => undefined };
}

async function connectedApp() {
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(createMemoryHistory({ initialEntries: ["/"] }));
  await router.load();
  // The app owns its router and connects the environment; the pane shares its atom registry.
  const app = await render(<AppRoot router={router} />, { router: false });
  // The shell snapshot has arrived once the app names the project, so the connection is up.
  await expect.element(page.getByText(/“render” is a local workspace/)).toBeVisible();
  return app;
}

it("opens one embedded draft per binding, and persists the binding before the first send dispatches", async () => {
  using _environment = installFakeEnvironment([]);
  using _stores = freshStores();
  await using _app = await connectedApp();
  await using first = await render(pane, { container: aside() });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  expect(first.container.querySelector("[data-context-chat-pane]")).not.toBeNull();

  const drafts = () =>
    Object.values(useComposerDraftStore.getState().draftThreadsByThreadKey).filter(
      (draft) => draft.logicalProjectKey === bindingKey,
    );
  expect(drafts()).toHaveLength(1);
  const threadId = ThreadId.make(drafts()[0]!.threadId);
  expect(useContextChatPendingStore.getState().pending).toEqual({});

  await first.unmount();
  await using second = await render(pane, { container: aside() });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  expect(second.container.querySelector("[data-context-chat-pane]")).not.toBeNull();
  expect(drafts().map((draft) => draft.threadId)).toEqual([threadId]);

  await userEvent.click(page.getByTestId("composer-editor"));
  await userEvent.keyboard("what is blocked?{Enter}");
  // The fake environment leaves startTurn pending, so the thread is not created yet: the
  // association is already in the persisted store, before anything was dispatched.
  await vi.waitFor(() =>
    expect(
      useContextChatPendingStore.getState().pending[pendingBindingKey(ENVIRONMENT_ID, threadId)],
    ).toMatchObject({ threadId, binding }),
  );
});

it("swaps the draft for the server thread once it exists, then writes and clears the binding", async () => {
  using _environment = installFakeEnvironment([]);
  using _stores = freshStores();
  await using _app = await connectedApp();
  await using screen = await render(pane, { container: aside() });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  const draft = Object.values(useComposerDraftStore.getState().draftThreadsByThreadKey).find(
    (candidate) => candidate.logicalProjectKey === bindingKey,
  )!;
  const threadId = ThreadId.make(draft.threadId);

  await userEvent.click(page.getByTestId("composer-editor"));
  await userEvent.keyboard("what is blocked?{Enter}");
  const key = pendingBindingKey(ENVIRONMENT_ID, threadId);
  await vi.waitFor(() => expect(useContextChatPendingStore.getState().pending[key]).toBeDefined());
  expect(recordedContextBindings()).toEqual([]);

  // The server creates the thread (inside startTurn, after the association was persisted).
  await emitThreadCreated({ ...threadWithHistory(threadId, 1), title: "What is blocked?" });
  await expect.element(page.getByText(`Answer 0 for ${threadId}.`)).toBeVisible();
  expect(screen.container.querySelector("[data-context-chat-pane]")).not.toBeNull();
  await vi.waitFor(() =>
    expect(useContextChatPendingStore.getState().pending[key]).toBeUndefined(),
  );
  expect(recordedContextBindings()).toEqual([{ threadId, binding }]);
  expect(useContextChatPendingStore.getState().activeByBindingKey[bindingKey]).toEqual({
    environmentId: ENVIRONMENT_ID,
    threadId,
  });
});
