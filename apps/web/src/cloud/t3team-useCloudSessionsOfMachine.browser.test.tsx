import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

const mocks = vi.hoisted(() => ({
  primary: null as string | null,
  enabledCalls: [] as boolean[],
}));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => mocks.primary }));
vi.mock("~/state/t3team-cloudSessions", () => ({
  useCloudSessions: (enabled: boolean) => {
    mocks.enabledCalls.push(enabled);
    return { sessions: [] };
  },
}));

import { useCloudSessionsOfMachine } from "./t3team-useCloudSessionsOfMachine";

function Probe({ environmentId }: { environmentId: string }) {
  useCloudSessionsOfMachine(EnvironmentId.make(environmentId));
  return null;
}

async function listRequestedFor(
  environmentId: string,
  primary: string | null = "env-primary",
): Promise<boolean> {
  mocks.primary = primary;
  mocks.enabledCalls.length = 0;
  await using _screen = await render(<Probe environmentId={environmentId} />, { router: false });
  return mocks.enabledCalls.at(-1) === true;
}

describe("useCloudSessionsOfMachine", () => {
  it("does not ask for the list on the user's own machine", async () => {
    expect(await listRequestedFor("env-primary")).toBe(false);
  });

  it("asks for it on another environment, which may be a cloud machine", async () => {
    expect(await listRequestedFor("env-machine")).toBe(true);
  });

  it("does not ask while the primary environment is unresolved", async () => {
    expect(await listRequestedFor("env-primary", null)).toBe(false);
  });
});
