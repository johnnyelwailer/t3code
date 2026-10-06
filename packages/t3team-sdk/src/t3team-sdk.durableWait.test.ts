import { describe, expect, it } from "vite-plus/test";

import { createDurableWait, withDurableWait } from "./t3team-sdk.durableWait.ts";
import type { WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import type * as T from "./t3team-sdk.types.ts";

/** A one-entry seat: replays `recorded` when given, else executes and captures the record. */
function seat(recorded?: unknown, now = 1_000) {
  const journal: unknown[] = [];
  const callPrimitive = async <R>(call: T.PrimitiveCall<R>): Promise<R> => {
    if (recorded !== undefined) return (await call.decodeRecorded!(recorded)) as R;
    const value = await call.exec();
    journal.push(value);
    return value;
  };
  return { runtime: { callPrimitive, hostNow: () => now }, journal };
}

function recorder() {
  const parked: number[] = [];
  const slept: number[] = [];
  return {
    parked,
    slept,
    park: async (deadline: number) => void parked.push(deadline),
    sleep: async (ms: number) => void slept.push(ms),
  };
}

describe("durable wait(ms)", () => {
  it("journals the deadline as parked and parks on the clock instead of sleeping", async () => {
    const { runtime, journal } = seat();
    const r = recorder();
    await createDurableWait({ runtime, park: r.park, sleep: r.sleep })(3_600_000);
    expect(journal).toEqual([{ deadline: 3_601_000, parked: true }]);
    expect(r.parked).toEqual([3_601_000]);
    expect(r.slept).toEqual([]);
  });

  it("re-issues the park on replay of a parked entry, even past the deadline", async () => {
    // Skipping it would drop the journaled `wait.until` and shift every later seq.
    const { runtime } = seat({ deadline: 500, parked: true }, 9_999);
    const r = recorder();
    await createDurableWait({ runtime, park: r.park, sleep: r.sleep })(10);
    expect(r.parked).toEqual([500]);
  });

  it("replays an entry journaled before parking existed as the in-process sleep it was", async () => {
    const { runtime } = seat({ deadline: 1_500 });
    const r = recorder();
    await createDurableWait({ runtime, park: r.park, sleep: r.sleep })(500);
    expect(r.parked).toEqual([]);
    expect(r.slept).toEqual([500]);
  });

  it("binds the parking wait only for a body that declares the schedule capability", () => {
    const legacyWait = async () => {};
    const primitives = { wait: legacyWait } as unknown as WorkflowPrimitives;
    const deps = { primitives, runtime: seat().runtime, schedule: { waitUntil: recorder().park } };
    expect(withDurableWait({ ...deps, capabilities: new Set() }).wait).toBe(legacyWait);
    expect(withDurableWait({ ...deps, capabilities: new Set(["schedule"]) }).wait).not.toBe(
      legacyWait,
    );
  });
});
