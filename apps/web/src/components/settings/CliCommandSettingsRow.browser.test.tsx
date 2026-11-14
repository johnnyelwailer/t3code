import { RegistryContext } from "@effect/atom-react";
import type { DesktopCliCommandState } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { applyT3TeamPackAppearance } from "~/t3team/t3team-packAppearance";

import { act, render, stubGlobal } from "../../../test/render";
import { desktopCliCommandStateAtom } from "../../state/desktopCliCommand";
import { CliCommandSettingsRow } from "./CliCommandSettingsRow";

it("blocks installation behind another t3 without blocking removal of our installation", async () => {
  const state: DesktopCliCommandState = {
    supported: true,
    installedPath: null,
    onPath: false,
    launcherPath: "/home/test/.t3/bin/t3",
  };
  const getState = vi.fn(async (): Promise<DesktopCliCommandState> => ({
    ...state,
    shadowedBy: "/usr/local/bin/t3",
  }));
  const uninstall = vi.fn(async () => state);
  using _bridge = stubGlobal("desktopBridge", {
    cliCommand: { getState, install: vi.fn(async () => state), uninstall },
    getLocalEnvironmentEnabled: () => true,
    getLocalEnvironmentBootstraps: () => [],
  });
  const registry = AtomRegistry.make();
  using _registry = { [Symbol.dispose]: () => registry.dispose() };
  applyT3TeamPackAppearance({
    themeId: "nexi",
    name: "Nexi",
    labels: { appName: "Nexi" },
    colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
  });
  using _appearance = { [Symbol.dispose]: () => applyT3TeamPackAppearance(undefined) };
  await using screen = await render(
    <RegistryContext.Provider value={registry}>
      <CliCommandSettingsRow />
    </RegistryContext.Provider>,
  );

  await expect.element(screen.getByText(/Remove it to use Nexi's\./)).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Install" })).toBeDisabled();

  getState.mockResolvedValue(state);
  await act(() => registry.refresh(desktopCliCommandStateAtom));
  await expect.element(screen.getByRole("button", { name: "Install" })).toBeEnabled();

  getState.mockResolvedValue({
    ...state,
    installedPath: "/home/test/.local/bin/t3",
    shadowedBy: "/usr/local/bin/t3",
  });
  await act(() => registry.refresh(desktopCliCommandStateAtom));
  const remove = screen.getByRole("button", { name: "Remove" });
  await expect.element(remove).toBeEnabled();
  await remove.click();
  expect(uninstall).toHaveBeenCalledOnce();
});
