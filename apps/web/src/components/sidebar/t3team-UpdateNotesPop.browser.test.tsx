import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import {
  badge,
  clickAway,
  nexiReady,
  popped,
  publish,
  releaseNotes,
  renderInSidebar,
  setup,
  update,
  VERSION,
} from "./t3team-updatePill.testkit";

const kit = vi.hoisted(() => () => import("./t3team-updatePill.mocks"));
vi.mock("../../state/desktopUpdate", async (original) =>
  (await kit()).mockedModules.desktopUpdate(
    await original<typeof import("../../state/desktopUpdate")>(),
  ),
);
vi.mock("../../env", async (original) =>
  (await kit()).mockedModules.env(await original<typeof import("../../env")>()),
);
vi.mock("./useUpdateEverything", async () => (await kit()).mockedModules.updateEverything());
vi.mock("~/t3team/t3team-useFeatureFlag", async () => (await kit()).mockedModules.featureFlag());
vi.mock("../../localApi", async () => (await kit()).mockedModules.localApi());
vi.mock("../ServerUpdateAction", async (original) =>
  (await kit()).mockedModules.serverUpdate(
    await original<typeof import("../ServerUpdateAction")>(),
  ),
);
vi.mock("./t3team-useProviderEntryUpdate", async () =>
  (await kit()).mockedModules.providerEntryUpdate(),
);
vi.mock("./UpdateEverythingDialog", async (original) =>
  (await kit()).mockedModules.updateDialog(
    await original<typeof import("./UpdateEverythingDialog")>(),
  ),
);

const renderPill = (options?: { open?: boolean }) =>
  renderInSidebar(<SidebarUpdatePill />, options);
const footerNotes = () => document.querySelector('[data-testid="nexi-update-popover"]');

describe("Update notes pop on the pill", () => {
  it("pops once per version and keeps the dot until the notes are opened", async () => {
    setup(update(), { hasUpdates: true, popped: false });
    {
      await using _screen = await renderPill();
      await vi.waitFor(() => expect(releaseNotes()).not.toBeNull());
      await expect.element(page.getByText("Faster sidebar.")).toBeVisible();
      expect(badge()).not.toBeNull();

      await clickAway();
      await vi.waitFor(() => expect(releaseNotes()).toBeNull());
      expect(badge()).not.toBeNull();
    }
    await using screen = await renderPill();
    const pill = screen.getByRole("button", { name: /\(new\)$/ });
    await expect.element(pill).toBeVisible();
    expect(releaseNotes()).toBeNull();

    await userEvent.hover(pill);
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

  it("shows neither dot nor pop without the flag", async () => {
    setup(update(), { hasUpdates: true, flag: false, popped: false });
    await using screen = await renderPill();
    await expect.element(screen.getByRole("button", { name: "Update everything" })).toBeVisible();
    expect(badge()).toBeNull();
    expect(releaseNotes()).toBeNull();
    expect(popped()).toBeNull();
  });
});

describe("Update notes pop on the Nexi ready footer", () => {
  it("pops from the footer when that replaces the pill", async () => {
    setup(nexiReady(), { popped: false });
    await using _screen = await renderPill();
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    expect(popped()).toBe(VERSION);
    expect(badge()).toBeNull();
  });

  it("keeps the footer closed while the sidebar is collapsed", async () => {
    setup(nexiReady(), { popped: false });
    await using screen = await renderPill({ open: false });
    await expect.element(page.getByTestId("nexi-update-ready-icon")).toBeInTheDocument();
    expect(footerNotes()).toBeNull();
    expect(popped()).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    expect(popped()).toBe(VERSION);
  });

  it("hands over to the pill without a second pop or a stale dot", async () => {
    setup(nexiReady(), { popped: false });
    await using _screen = await renderPill();
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    await clickAway();
    await vi.waitFor(() => expect(footerNotes()).toBeNull());
    await userEvent.click(page.getByTestId("nexi-update-ready-icon"));
    await expect.element(page.getByTestId("nexi-update-popover")).toBeVisible();
    await clickAway();
    await vi.waitFor(() => expect(footerNotes()).toBeNull());

    await publish({ hasUpdates: true });
    await expect.element(page.getByRole("button", { name: /^Update everything/ })).toBeVisible();
    expect(releaseNotes()).toBeNull();
    expect(badge()).toBeNull();
  });
});
