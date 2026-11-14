import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { stubGlobal } from "../../../test/render";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
import {
  APP_ROW,
  BOX_ROW,
  BOX_SERVER,
  mocks,
  renderInSidebar,
  setup,
  update,
  VERSION,
} from "./t3team-updatePill.testkit";
import type { UpdateEverythingRow } from "./updateEverything.logic";

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
vi.mock("../../localApi", async () => (await kit()).mockedModules.localApi());
vi.mock("~/t3team/t3team-useFeatureFlag", async () => (await kit()).mockedModules.featureFlag());
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

const renderPill = () => renderInSidebar(<SidebarUpdatePill />);

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
