import { describe, expect, it } from "vite-plus/test";

import { createWorkflowHostDriveSlot } from "./t3team-sdk.workflowHostDriveSlot.ts";

/** A drive that records its span and waits for the test to release it. */
function probe(log: string[], live: { now: number; max: number }) {
  const gates = new Map<string, () => void>();
  const drive = (name: string) => async () => {
    live.now += 1;
    live.max = Math.max(live.max, live.now);
    log.push(`start ${name}`);
    await new Promise<void>((resolve) => gates.set(name, resolve));
    log.push(`end ${name}`);
    live.now -= 1;
  };
  const started = async (name: string) => {
    for (let i = 0; i < 20 && !gates.has(name); i += 1) await Promise.resolve();
    if (!gates.has(name)) throw new Error(`drive ${name} never started`);
  };
  const release = async (name: string) => {
    await started(name);
    gates.get(name)?.();
  };
  return { drive, started, release };
}

describe("workflow host drive slot", () => {
  it("drains owed work after the drive: queued drives in order, then ONE replay; never two at once", async () => {
    const log: string[] = [];
    const live = { now: 0, max: 0 };
    const { drive, release } = probe(log, live);
    const slot = createWorkflowHostDriveSlot(() => true);

    const running = slot.run(drive("A"));
    expect(slot.busy()).toBe(true);
    await slot.run(drive("ignored")); // a run while busy is a no-op
    slot.oweReplay(drive("replay-1"));
    slot.oweReplay(drive("replay-2")); // deduplicated: one owed replay
    slot.oweDrive(drive("resume-B"));

    await release("A");
    await release("resume-B");
    // The owed replay was satisfied by resume-B's full replay: nothing is left to run.
    await running;

    expect(log).toEqual(["start A", "end A", "start resume-B", "end resume-B"]);
    expect(live.max).toBe(1);
    expect(slot.busy()).toBe(false);
  });

  it("runs an owed replay that arrives during the drain, then lets go", async () => {
    const log: string[] = [];
    const live = { now: 0, max: 0 };
    const { drive, started, release } = probe(log, live);
    const slot = createWorkflowHostDriveSlot(() => true);

    const running = slot.run(drive("A"));
    slot.oweReplay(drive("replay-1"));
    await release("A");
    await started("replay-1");
    slot.oweReplay(drive("replay-2")); // lands while replay-1 runs
    await release("replay-1");
    await release("replay-2");
    await running;

    expect(log).toEqual([
      "start A",
      "end A",
      "start replay-1",
      "end replay-1",
      "start replay-2",
      "end replay-2",
    ]);
    expect(live.max).toBe(1);
  });

  it("discards owed work once the run can no longer continue", async () => {
    let alive = true;
    const log: string[] = [];
    const { drive, release } = probe(log, { now: 0, max: 0 });
    const slot = createWorkflowHostDriveSlot(() => alive);

    const running = slot.run(drive("A"));
    slot.oweReplay(drive("replay"));
    alive = false; // cancelled / settled / gone from the registry
    await release("A");
    await running;

    expect(log).toEqual(["start A", "end A"]);
  });

  it("still drains after a drive throws, then rethrows the first error", async () => {
    const slot = createWorkflowHostDriveSlot(() => true);
    const ran: string[] = [];
    const running = slot.run(async () => {
      throw new Error("drive failed");
    });
    slot.oweReplay(async () => {
      ran.push("owed replay");
    });
    await expect(running).rejects.toThrow("drive failed");
    expect(ran).toEqual(["owed replay"]);
    expect(slot.busy()).toBe(false);
  });
});
