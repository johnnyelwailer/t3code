import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  targetTag: null as string | null,
  enabledCalls: [] as boolean[],
}));
vi.mock("~/state/presentation", () => ({
  useEnvironmentPresentation: () => ({
    isReady: true,
    presentation:
      mocks.targetTag === null ? null : { entry: { target: { _tag: mocks.targetTag } } },
  }),
}));
vi.mock("~/state/t3team-cloudSessions", () => ({
  useCloudSessions: (enabled: boolean) => {
    mocks.enabledCalls.push(enabled);
    return { sessions: [] };
  },
}));

import { useCloudSessionsOfMachine } from "./t3team-useCloudSessionsOfMachine";

function Probe() {
  useCloudSessionsOfMachine(EnvironmentId.make("env-thread"));
  return null;
}

async function listRequestedFor(targetTag: string | null): Promise<boolean> {
  mocks.targetTag = targetTag;
  mocks.enabledCalls.length = 0;
  await using _screen = await render(<Probe />, { router: false });
  return mocks.enabledCalls.at(-1) === true;
}

describe("useCloudSessionsOfMachine", () => {
  it("does not ask for the list on the user's own machine", async () => {
    expect(await listRequestedFor("PrimaryConnectionTarget")).toBe(false);
  });

  it("does not ask for an SSH host or before the environment is known", async () => {
    expect(await listRequestedFor("SshConnectionTarget")).toBe(false);
    expect(await listRequestedFor(null)).toBe(false);
  });

  it("asks for it on a relay or broker environment, which may be a cloud machine", async () => {
    expect(await listRequestedFor("RelayConnectionTarget")).toBe(true);
    expect(await listRequestedFor("BrokerConnectionTarget")).toBe(true);
  });
});
