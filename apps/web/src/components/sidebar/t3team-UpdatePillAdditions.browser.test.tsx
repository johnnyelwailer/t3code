import { type DesktopUpdateState, EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render, stubGlobal } from "../../../test/render";
import type { ServerUpdateTarget } from "../ServerUpdateAction";
import { SidebarProvider, useSidebar } from "../ui/sidebar";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import type { UpdateEverythingRow } from "./updateEverything.logic";

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const current: { update: DesktopUpdateState | null } = { update: null };
  return {
    current,
    hasUpdates: false,
    flag: false,
    rows: new Array<UpdateEverythingRow>(),
    servers: new Array<ServerUpdateTarget>(),
    runEverything: vi.fn(),
    confirm: vi.fn(),
    updateServer: vi.fn(),
    updateProvider: vi.fn(),
    claude: { driver: "claudeAgent" },
    runningThreadsPerMachine: 2,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock("../../state/desktopUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../state/desktopUpdate")>()),
  useDesktopUpdateState: (await import("react")).useSyncExternalStore.bind(
    null,
    mocks.subscribe,
    () => mocks.current.update,
  ),
}));
vi.mock("../../env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../env")>()),
  isElectron: true,
}));
vi.mock("./useUpdateEverything", () => ({
  useUpdateEverything: () => ({
    hasUpdates: mocks.hasUpdates,
    summary: "Update everything",
    version: null,
    providerCount: 0,
    rows: mocks.rows,
    restarts: [],
    servers: mocks.servers,
    run: mocks.runEverything,
  }),
}));
vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({ dialogs: { confirm: mocks.confirm } }),
}));
vi.mock("~/t3team/t3team-useFeatureFlag", () => ({
  useFeatureFlag: (key: string) => key === "UI_UPDATE_BADGE_ROW_ACTIONS" && mocks.flag,
}));
vi.mock("../ServerUpdateAction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ServerUpdateAction")>()),
  useServerUpdate: () => mocks.updateServer,
}));
vi.mock("./t3team-useProviderEntryUpdate", () => ({
  useProviderEntryUpdate: () => ({
    machines: [{ environmentId: "env-box", label: "build-box", candidates: [mocks.claude] }],
    update: mocks.updateProvider,
  }),
}));
vi.mock("./UpdateEverythingDialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./UpdateEverythingDialog")>()),
  runningThreadCountAtom: Atom.family((ids: string) =>
    Atom.make(ids.split("\n").filter((id) => id !== "").length * mocks.runningThreadsPerMachine),
  ),
}));

const VERSION = "0.0.50-nightly.2";

function update(overrides: Partial<DesktopUpdateState> = {}): DesktopUpdateState {
  return {
    enabled: true,
    status: "available",
    channel: "nightly",
    currentVersion: "0.0.50-nightly.1",
    hostArch: "arm64",
    appArch: "arm64",
    runningUnderArm64Translation: false,
    availableVersion: VERSION,
    downloadedVersion: null,
    releaseNotes: [{ version: VERSION, items: ["Faster sidebar."], totalItems: 1 }],
    omittedReleaseCount: 0,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false,
    ...overrides,
  };
}

const APP_ROW: UpdateEverythingRow = {
  environmentId: null,
  label: "This app",
  app: "this-app",
  providers: [],
  skipped: null,
};
const BOX_ROW: UpdateEverythingRow = {
  environmentId: EnvironmentId.make("env-box"),
  label: "build-box",
  app: "server",
  providers: ["Claude"],
  skipped: null,
};
const BOX_SERVER: ServerUpdateTarget = {
  environmentId: EnvironmentId.make("env-box"),
  serverLabel: "build-box",
  selfUpdate: null,
  targetVersion: VERSION,
};

function setup(
  state: DesktopUpdateState,
  {
    hasUpdates = false,
    flag = true,
    popped = true,
    rows = [APP_ROW, BOX_ROW],
  }: {
    hasUpdates?: boolean;
    flag?: boolean;
    popped?: boolean;
    rows?: ReadonlyArray<UpdateEverythingRow>;
  } = {},
) {
  mocks.current.update = state;
  mocks.hasUpdates = hasUpdates;
  mocks.flag = flag;
  mocks.rows = [...rows];
  mocks.servers = [BOX_SERVER];
  for (const fn of [mocks.runEverything, mocks.confirm, mocks.updateServer, mocks.updateProvider]) {
    fn.mockReset();
  }
  mocks.updateServer.mockResolvedValue({ status: "updated" });
  mocks.updateProvider.mockResolvedValue(undefined);
  localStorage.removeItem("update.notes.seenVersion");
  localStorage.setItem("nexi.update.notifiedVersion", VERSION);
  if (popped) localStorage.setItem("update.notes.poppedVersion", VERSION);
  else localStorage.removeItem("update.notes.poppedVersion");
}

function ExpandSidebar() {
  const { toggleSidebar } = useSidebar();
  return (
    <button type="button" onClick={toggleSidebar}>
      Toggle sidebar
    </button>
  );
}

async function renderPill({ open = true } = {}) {
  await page.viewport(1280, 800);
  return render(
    <SidebarProvider defaultOpen={open}>
      <ExpandSidebar />
      <SidebarUpdatePill />
    </SidebarProvider>,
  );
}

const badge = () => document.querySelector('[data-testid="update-notes-badge"]');
const releaseNotes = () => document.querySelector('[aria-label="Update release notes"]');
const popped = () => localStorage.getItem("update.notes.poppedVersion");

describe("Update pill click with only the app to update", () => {
  it("still downloads on click", async () => {
    const state = update();
    setup(state);
    const downloadUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
    using _bridge = stubGlobal("desktopBridge", { downloadUpdate });
    await using screen = await renderPill();
    await userEvent.click(screen.getByRole("button", { name: /ready to download/ }));
    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
  });
});

describe("Update dialog row buttons", () => {
  it.each([false, true])("update single entries only behind the flag (%s)", async (flag) => {
    const state = update();
    setup(state, { hasUpdates: true, flag });
    const downloadUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
    using _bridge = stubGlobal("desktopBridge", { downloadUpdate });
    await using screen = await renderPill();
    await userEvent.click(screen.getByRole("button", { name: /^Update everything/ }));
    await expect.element(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    const server = page.getByRole("button", { name: /^Update build-box/ });
    if (!flag) {
      await expect.element(server).not.toBeInTheDocument();
      return;
    }
    await userEvent.click(server);
    await vi.waitFor(() => expect(mocks.updateServer).toHaveBeenCalledWith(BOX_SERVER));
    await userEvent.click(page.getByRole("button", { name: "Update Claude on build-box" }));
    await vi.waitFor(() =>
      expect(mocks.updateProvider).toHaveBeenCalledWith("env-box", "build-box", mocks.claude),
    );
    expect(downloadUpdate).not.toHaveBeenCalled();

    await userEvent.click(page.getByRole("button", { name: "Download this app's update" }));
    await vi.waitFor(() => expect(downloadUpdate).toHaveBeenCalledOnce());
    expect(mocks.runEverything).not.toHaveBeenCalled();
  });

  it("restarts only this app from its row without a second confirmation", async () => {
    const state = update({ status: "downloaded", downloadedVersion: VERSION });
    setup(state, { hasUpdates: true });
    const installUpdate = vi.fn().mockResolvedValue({ accepted: true, completed: true, state });
    using _bridge = stubGlobal("desktopBridge", { installUpdate });
    await using screen = await renderPill();
    await userEvent.click(screen.getByRole("button", { name: /^Update everything/ }));
    await userEvent.click(page.getByRole("button", { name: /^Restart this app to update/ }));
    await vi.waitFor(() => expect(installUpdate).toHaveBeenCalledOnce());
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.runEverything).not.toHaveBeenCalled();
  });

  it("offers this app's restart once and names the threads of every machine it hosts", async () => {
    const hosted = (id: string, label: string): UpdateEverythingRow => ({
      ...APP_ROW,
      environmentId: EnvironmentId.make(id),
      label,
    });
    setup(update({ status: "downloaded", downloadedVersion: VERSION }), {
      hasUpdates: true,
      rows: [hosted("env-primary", "This Mac"), hosted("env-local", "Local server"), BOX_ROW],
    });
    await using screen = await renderPill();
    await userEvent.click(screen.getByRole("button", { name: /^Update everything/ }));
    const restart = page.getByRole("button", { name: /^Restart this app to update/ });
    await expect.element(restart).toBeVisible();
    expect(restart.elements()).toHaveLength(1);
    expect(restart.element().getAttribute("aria-label")).toBe(
      "Restart this app to update · interrupts 4 running threads",
    );
    await expect
      .element(
        page.getByRole("button", { name: "Update build-box · interrupts 2 running threads" }),
      )
      .toBeVisible();
  });
});

describe("Update notes pop", () => {
  it("pops once per version and keeps the dot until the notes are opened", async () => {
    setup(update(), { hasUpdates: true, popped: false });
    {
      await using _screen = await renderPill();
      await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());
      await expect.element(page.getByText("Faster sidebar.")).toBeVisible();
      expect(badge()).not.toBeNull();

      await userEvent.click(document.body);
      await vi.waitFor(() => expect(releaseNotes()).toBeNull());
      expect(badge()).not.toBeNull();
    }
    await using screen = await renderPill();
    await expect.element(screen.getByRole("button", { name: /\(new\)$/ })).toBeVisible();
    expect(releaseNotes()).toBeNull();

    await userEvent.hover(screen.getByRole("button", { name: /\(new\)$/ }));
    await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());
    await vi.waitFor(() => expect(badge()).toBeNull());
  });

  it("waits while the sidebar is collapsed and pops once it is shown", async () => {
    setup(update(), { hasUpdates: true, popped: false });
    await using screen = await renderPill({ open: false });
    await expect.element(screen.getByRole("button", { name: /\(new\)$/ })).toBeInTheDocument();
    expect(releaseNotes()).toBeNull();
    expect(popped()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());
    expect(popped()).toBe(VERSION);
  });

  it("pops from the Nexi ready footer when that replaces the pill", async () => {
    setup(update({ status: "downloaded", downloadedVersion: VERSION, feed: "nexi-ghe" }), {
      popped: false,
    });
    await using _screen = await renderPill();
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    expect(popped()).toBe(VERSION);
    expect(badge()).toBeNull();
  });

  it("keeps the Nexi ready footer closed while the sidebar is collapsed", async () => {
    setup(update({ status: "downloaded", downloadedVersion: VERSION, feed: "nexi-ghe" }), {
      popped: false,
    });
    await using screen = await renderPill({ open: false });
    await expect.element(page.getByTestId("nexi-update-ready-icon")).toBeInTheDocument();
    expect(document.querySelector('[data-testid="nexi-update-popover"]')).toBeNull();
    expect(popped()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    expect(popped()).toBe(VERSION);
  });

  it("shows neither dot nor pop without the flag", async () => {
    setup(update(), { hasUpdates: true, flag: false, popped: false });
    await using screen = await renderPill();
    await expect.element(screen.getByRole("button", { name: "Update everything" })).toBeVisible();
    expect(badge()).toBeNull();
    expect(releaseNotes()).toBeNull();
    expect(popped()).toBeNull();
  });
});
