/**
 * The panel asks the machine the sign-in would actually run on, not this one (hive#1280). The
 * `INTEGRATIONS_TOOL_AUTH` flag was on locally, so Install and connect appeared for a thread on a
 * cloud session whose server had it off — and every click was refused with nothing on screen.
 */
import { EnvironmentId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { render } from "../../../test/render";

const PRIMARY = EnvironmentId.make("env-primary");
const CLOUD = EnvironmentId.make("env-cloud");

vi.mock(import("../../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  // Opposite answers from the two machines, so a surface reading the wrong one cannot pass.
  const configs = new Map([
    [PRIMARY, Atom.make({ featureFlags: { INTEGRATIONS_TOOL_AUTH: true } })],
    [CLOUD, Atom.make({ featureFlags: { INTEGRATIONS_TOOL_AUTH: false } })],
  ]);
  return {
    ...actual,
    serverEnvironment: {
      ...actual.serverEnvironment,
      configValueAtom: ((id: EnvironmentId | null) =>
        configs.get(id as EnvironmentId) ?? Atom.make(null)) as never,
    } as never,
  };
});
vi.mock("../../state/t3team-toolauth", () => ({
  useToolAuthStates: () => new Map(),
  useToolAuthActions: () => ({
    environmentId: CLOUD,
    onConnect: () => {},
    onInstall: () => {},
    onSubmitCode: () => {},
    onCancel: () => {},
  }),
}));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => PRIMARY }));
vi.mock("../../cloud/t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
  useToolAuthMachineLabel: (id: EnvironmentId | null) =>
    id === CLOUD ? "this cloud machine" : "this machine",
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));

const { ModelPickerProviderConnectPanel } =
  await import("./t3team-ModelPickerProviderConnectPanel");

const [claude] = deriveProviderInstanceEntries([
  {
    instanceId: ProviderInstanceId.make("claudeAgent"),
    driver: ProviderDriverKind.make("claudeAgent"),
    displayName: "Claude Code",
    enabled: true,
    installed: false,
    version: null,
    status: "error",
    auth: { status: "unknown" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  },
]);

function panel(environmentId: EnvironmentId) {
  return (
    <ModelPickerProviderConnectPanel
      entry={claude!}
      tool="claude"
      readiness="needsInstall"
      environmentId={environmentId}
    />
  );
}

describe("model picker connect panel follows the target environment's flags", () => {
  it("gives the reason instead of a button when the target machine has sign-in off", async () => {
    await using screen = await render(panel(CLOUD), { router: false });

    await expect.element(screen.getByTestId("toolauth-unavailable")).toBeInTheDocument();
    await expect
      .element(screen.getByText("Claude Code sign-in isn't enabled on this cloud machine yet."))
      .toBeInTheDocument();
    await expect
      .element(
        screen.getByText(
          "Turn on CLI tool sign-in for this cloud machine, or sign Claude Code in from its terminal.",
        ),
      )
      .toBeInTheDocument();
    expect(screen.container.querySelector("[data-testid='toolauth-primary-action']")).toBeNull();
  });

  it("offers the button on a machine that has it on, with the same primary flags", async () => {
    await using screen = await render(panel(PRIMARY), { router: false });

    await expect
      .element(screen.getByTestId("toolauth-primary-action"))
      .toHaveTextContent("Install and connect");
    expect(screen.container.querySelector("[data-testid='toolauth-unavailable']")).toBeNull();
  });
});
