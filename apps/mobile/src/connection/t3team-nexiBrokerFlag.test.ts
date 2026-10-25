import { describe, expect, it, vi } from "vite-plus/test";
import { createBrokerFlagWatcher } from "./t3team-nexiBrokerFlag";

function setup(initial: boolean) {
  const events: string[] = [];
  const observe = createBrokerFlagWatcher(initial, {
    closeTunnels: vi.fn(() => events.push("close")),
    wake: vi.fn(() => events.push("wake")),
  });
  return { observe, events };
}

describe("Nexi mobile broker flag transitions", () => {
  it("wakes blocked connections when the flag turns on after being off at start", () => {
    const { observe, events } = setup(false);
    observe(true);
    expect(events).toEqual(["wake"]);
  });
  it("closes tunnels when the flag turns off and wakes again when it returns", () => {
    const { observe, events } = setup(true);
    observe(false);
    observe(true);
    expect(events).toEqual(["close", "wake"]);
  });
  it("wakes exactly once per off-to-on transition, never on repeated on emissions", () => {
    const { observe, events } = setup(false);
    observe(true);
    observe(true);
    observe(true);
    expect(events).toEqual(["wake"]);
  });
  it("does not wake or close when nothing changed from the initial state", () => {
    const enabled = setup(true);
    enabled.observe(true);
    expect(enabled.events).toEqual([]);
  });
  it("wakes connections added while off once the flag turns on", () => {
    // Connections attached while off are refused before any tunnel starts, so only the wake restores them.
    const { observe, events } = setup(false);
    observe(false);
    observe(true);
    // The off emission keeps closing (idempotent); the single wake is what restores the blocked connection.
    expect(events).toEqual(["close", "wake"]);
  });
  it("closes tunnels on every off emission so a late tunnel cannot outlive the flag", () => {
    const { observe, events } = setup(true);
    observe(false);
    observe(false);
    expect(events).toEqual(["close", "close"]);
  });
});
