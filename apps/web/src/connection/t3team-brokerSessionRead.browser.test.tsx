import type { CloudSession } from "@t3tools/contracts";
import { AtomRegistry, Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers } from "../../test/render";
import { readSessionsForBrokerAttach } from "./t3team-brokerSessionRead";

const ready = { sessionId: "200", phase: "ready" } as unknown as CloudSession;
const state = (loading: boolean, sessions: CloudSession[]) => ({ loading, sessions });

describe("readSessionsForBrokerAttach", () => {
  it("reads a loaded list as it is", async () => {
    const registry = AtomRegistry.make();
    const list = Atom.make(state(false, [ready]));
    expect(await readSessionsForBrokerAttach({ registry, list })).toEqual([ready]);
  });

  it("waits for a list that nothing has loaded yet instead of reading it as empty", async () => {
    const registry = AtomRegistry.make();
    const list = Atom.make(state(true, []));
    const read = readSessionsForBrokerAttach({ registry, list });
    registry.set(list, state(false, [ready]));
    expect(await read).toEqual([ready]);
  });

  it("goes without sessions when the list does not load in time", async () => {
    using _timers = fakeTimers();
    const registry = AtomRegistry.make();
    const list = Atom.make(state(true, []));
    const read = readSessionsForBrokerAttach({ registry, list, waitMs: 1_000 });
    vi.advanceTimersByTime(1_000);
    expect(await read).toEqual([]);
  });
});
