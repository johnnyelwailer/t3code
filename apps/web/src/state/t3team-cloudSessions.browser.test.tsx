import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

const mocks = vi.hoisted(() => ({ listReads: 0 }));

vi.mock("@t3tools/client-runtime/state/cloud-sessions", () => ({
  // The list family, standing in for the RPC: building its atom is the request.
  createCloudSessionAtoms: () => ({
    list: () =>
      Atom.make(() => {
        mocks.listReads += 1;
        return AsyncResult.success({ sessions: [], configured: true, historyUrl: null });
      }),
  }),
}));
vi.mock("~/connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("./primaryEnvironment", () => ({
  primaryEnvironmentIdAtom: Atom.make("env-primary").pipe(Atom.keepAlive),
}));

import { type CloudSessionListState, useCloudSessions } from "./t3team-cloudSessions";

const seen: { latest: CloudSessionListState | null } = { latest: null };

function Probe({ enabled }: { enabled: boolean }) {
  const state = useCloudSessions(enabled);
  useEffect(() => {
    seen.latest = state;
  });
  return null;
}

function freshReads(): void {
  mocks.listReads = 0;
  seen.latest = null;
}

describe("useCloudSessions", () => {
  it("does not ask for the list when disabled, and does not read as an empty answer", async () => {
    freshReads();
    await using _screen = await render(<Probe enabled={false} />, { router: false });
    expect(mocks.listReads).toBe(0);
    expect(seen.latest?.loading).toBe(true);
    expect(seen.latest?.sessions).toEqual([]);
  });

  it("asks for the list once enabled", async () => {
    freshReads();
    await using screen = await render(<Probe enabled={false} />, { router: false });
    await screen.rerender(<Probe enabled />);
    expect(mocks.listReads).toBe(1);
    expect(seen.latest?.loading).toBe(false);
    expect(seen.latest?.configured).toBe(true);
  });
});
