import { RegistryProvider } from "@effect/atom-react";
import { FeatureFlagSetError, type FeatureFlagsView } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import type { Locator } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { buildFeatureFlagsViewFixture } from "./t3team-featureFlagsSettings.fixture";

type SetResult =
  | AsyncResult.Success<FeatureFlagsView, unknown>
  | AsyncResult.Failure<never, unknown>;

const state = vi.hoisted(() => ({
  view: null as FeatureFlagsView | null,
  canEdit: true,
  run: vi.fn<(target: unknown) => Promise<SetResult>>(),
}));

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const query = Atom.make(() => AsyncResult.success(state.view));
  const permission = Atom.make(() => state.canEdit);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      featureFlags: (() => query) as never,
      setFeatureFlag: {
        ...actual.serverEnvironment.setFeatureFlag,
        permissionAtom: () => permission,
      },
    },
  };
});
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => state.run) as never,
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: (() => "env") as never,
}));

import { FeatureFlagsSettings } from "./t3team-FeatureFlagsSettings";
import { useFeatureFlagsSettings } from "./t3team-useFeatureFlagsSettings";

function setup({ canEdit = true } = {}) {
  state.view = buildFeatureFlagsViewFixture();
  state.canEdit = canEdit;
  state.run.mockReset();
}

function ConnectedFeatureFlags() {
  return <FeatureFlagsSettings controller={useFeatureFlagsSettings()} />;
}

// The test page loads no app stylesheet, so a switch has no box for a pointer click.
const press = (locator: Locator) =>
  act(() => locator.element().dispatchEvent(new MouseEvent("click", { bubbles: true })));

const panel = () => (
  <RegistryProvider>
    <ConnectedFeatureFlags />
  </RegistryProvider>
);

it("sends the flipped value and keeps it shown while the request is in flight", async () => {
  setup();
  let answer: (result: SetResult) => void = () => {};
  state.run.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  await using screen = await render(panel());
  const kanban = screen.getByRole("switch", { name: "Kanban board" });
  await expect.element(kanban).toBeChecked();

  await press(kanban);

  expect(state.run).toHaveBeenCalledWith({
    environmentId: "env",
    input: { key: "MYWORK_KANBAN", enabled: false },
  });
  await expect.element(kanban).not.toBeChecked();
  await expect.element(kanban).toBeDisabled();

  const view = buildFeatureFlagsViewFixture();
  answer(
    AsyncResult.success({
      ...view,
      flags: view.flags.map((flag) =>
        flag.key === "MYWORK_KANBAN" ? { ...flag, enabled: false, source: "user" } : flag,
      ),
    }),
  );
  await expect.element(kanban).toBeEnabled();
  await expect.element(kanban).not.toBeChecked();
});

it("resets a user choice by sending null", async () => {
  setup();
  state.run.mockResolvedValue(
    AsyncResult.success(buildFeatureFlagsViewFixture({ userValues: false })),
  );
  await using screen = await render(panel());

  await press(screen.getByRole("button", { name: "Reset Signal sources to default" }));

  expect(state.run).toHaveBeenCalledWith({
    environmentId: "env",
    input: { key: "ORCHESTRATION_SIGNAL_SOURCES", enabled: null },
  });
  await expect
    .element(screen.getByRole("button", { name: "Reset Signal sources to default" }))
    .not.toBeInTheDocument();
});

it("shows the server's refusal and returns the switch to the saved value", async () => {
  setup();
  state.run.mockResolvedValue(
    AsyncResult.failure(
      Cause.fail(new FeatureFlagSetError({ key: "MYWORK_KANBAN", category: "persistence" })),
    ),
  );
  await using screen = await render(panel());
  const kanban = screen.getByRole("switch", { name: "Kanban board" });

  await press(kanban);

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Could not save MYWORK_KANBAN.");
  await expect.element(kanban).toBeChecked();
});

it("keeps env-decided, release-only and permission-less switches read-only", async () => {
  setup();
  {
    await using screen = await render(panel());
    await expect.element(screen.getByRole("switch", { name: "Resource pressure" })).toBeDisabled();
    await expect
      .element(screen.getByRole("switch", { name: "Backend health watchdog" }))
      .toBeDisabled();
    await expect.element(screen.getByRole("switch", { name: "Kanban board" })).toBeEnabled();
  }
  setup({ canEdit: false });
  await using screen = await render(panel());
  await expect.element(screen.getByRole("switch", { name: "Kanban board" })).toBeDisabled();
  await expect
    .element(screen.getByText("This connection lacks permission to change settings.").first())
    .toBeVisible();
});
