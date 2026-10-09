import { EnvironmentId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";

const seen = vi.hoisted(() => ({ states: [] as unknown[], actions: [] as unknown[] }));

vi.mock("../../state/t3team-toolauth", () => ({
  useToolAuthStates: (environmentId: unknown) => {
    seen.states.push(environmentId);
    return new Map();
  },
  useToolAuthActions: (_meta: unknown, environmentId: unknown) => {
    seen.actions.push(environmentId);
    return { onConnect: () => {}, onInstall: () => {}, onSubmitCode: () => {}, onCancel: () => {} };
  },
}));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => EnvironmentId.make("env-primary"),
}));

const { ModelPickerProviderConnectPanel } =
  await import("./t3team-ModelPickerProviderConnectPanel");

const [codex] = deriveProviderInstanceEntries([
  {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    displayName: "Codex",
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

describe("ModelPickerProviderConnectPanel environment", () => {
  it("reads and acts on the thread's machine, not this computer, for a cloud thread", () => {
    seen.states.length = 0;
    seen.actions.length = 0;
    renderToStaticMarkup(
      <ModelPickerProviderConnectPanel
        entry={codex!}
        tool="codex"
        readiness="needsInstall"
        environmentId={EnvironmentId.make("env-cloud")}
      />,
    );
    expect(seen.states).toEqual(["env-cloud"]);
    expect(seen.actions).toEqual(["env-cloud"]);
  });

  it("falls back to the primary environment when none is given", () => {
    seen.states.length = 0;
    seen.actions.length = 0;
    renderToStaticMarkup(
      <ModelPickerProviderConnectPanel entry={codex!} tool="codex" readiness="needsInstall" />,
    );
    expect(seen.states).toEqual(["env-primary"]);
    expect(seen.actions).toEqual(["env-primary"]);
  });
});
