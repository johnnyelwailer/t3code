import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import {
  MY_WORK_PANEL_REF,
  selectSelectedRightPanelSurface,
  useRightPanelStore,
} from "~/rightPanelStore";

import { act, render } from "../../test/render";

vi.mock(import("~/hooks/useTheme"), async (original) => ({
  ...(await original()),
  useTheme: () => ({ theme: "light", resolvedTheme: "light", themeHalves: null }) as never,
}));
vi.mock(import("~/browser/browserDefaults"), async (original) => ({
  ...(await original()),
  useBrowserDefaults: () => ({ profiles: [] }) as never,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useThreadShells: () => [] as never,
}));

import { MyWorkRightPanel } from "./t3team-MyWorkRightPanel";

const noop = () => undefined;
const KICKOFF = <div data-testid="kickoff">kickoff</div>;
const CHAT = <div data-testid="chat-body">chat body</div>;

function panel(chatTab?: React.ReactNode) {
  return (
    <AppAtomRegistryProvider>
      <MyWorkRightPanel
        project={null}
        projectThreads={[]}
        onRememberEmbeddedThread={noop}
        kickoff={KICKOFF}
        {...(chatTab === undefined ? {} : { chatTab })}
      />
    </AppAtomRegistryProvider>
  );
}

const pinnedTab = (screen: { container: HTMLElement }) =>
  screen.container.querySelector<HTMLButtonElement>("[data-pinned-tab]");
const resetPanel = () => useRightPanelStore.getState().closeAllSurfaces(MY_WORK_PANEL_REF);

it("with the flag off, My Work keeps the kickoff and has no pinned tab", async () => {
  resetPanel();
  await using screen = await render(panel(), { router: false });
  await expect.element(page.getByTestId("kickoff")).toBeVisible();
  expect(pinnedTab(screen)).toBeNull();
  expect(screen.container.querySelector("[data-testid=chat-body]")).toBeNull();
});

it("with the chat tab on, a pinned Chat tab is present, not closable and shows the chat", async () => {
  resetPanel();
  await using screen = await render(panel(CHAT), { router: false });
  await expect.element(page.getByTestId("chat-body")).toBeVisible();
  expect(screen.container.querySelector("[data-testid=kickoff]")).toBeNull();
  expect(pinnedTab(screen)?.textContent).toBe("Chat");
  expect(pinnedTab(screen)?.dataset.activeTab).toBe("true");
  expect(screen.container.querySelector("[aria-label^='Close Chat']")).toBeNull();
  expect(pinnedTab(screen)?.querySelector("button")).toBeNull();
});

it("selecting the pinned tab brings the chat back from an open surface and leaves the surface open", async () => {
  resetPanel();
  await using screen = await render(panel(CHAT), { router: false });
  await act(async () => {
    useRightPanelStore.getState().openBrowser(MY_WORK_PANEL_REF, null);
    useRightPanelStore.getState().show(MY_WORK_PANEL_REF);
  });
  expect(pinnedTab(screen)?.dataset.activeTab).toBe("false");
  expect(screen.container.querySelector("[data-testid=chat-body]")).toBeNull();

  await act(async () => pinnedTab(screen)?.click());
  await expect.element(page.getByTestId("chat-body")).toBeVisible();
  const state = useRightPanelStore.getState();
  expect(selectSelectedRightPanelSurface(state.byThreadKey, MY_WORK_PANEL_REF)).toBeNull();
  expect(
    state.byThreadKey[`${MY_WORK_PANEL_REF.environmentId}:${MY_WORK_PANEL_REF.threadId}`]?.surfaces,
  ).toHaveLength(1);
});
