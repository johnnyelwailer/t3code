import { afterEach, describe, expect, it } from "vite-plus/test";

import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import { setWorkflowEphemeralConcurrencyPolicy } from "./t3team-workflowEphemeralConcurrencyPolicy.ts";

afterEach(() => {
  workflowAdmissionQueue.resetForTests();
  setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 8 });
});

describe("workflowAdmissionQueue", () => {
  it("round-robins primitive turns in FIFO order: A1, B1, A2, B2", async () => {
    setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 1 });
    const order: string[] = [];
    await workflowAdmissionQueue.acquire("A");
    order.push("A1");
    const b1 = workflowAdmissionQueue.acquire("B").then(() => order.push("B1"));
    workflowAdmissionQueue.release("A");
    await b1;
    const a2 = workflowAdmissionQueue.acquire("A").then(() => order.push("A2"));
    workflowAdmissionQueue.release("B");
    await a2;
    const b2 = workflowAdmissionQueue.acquire("B").then(() => order.push("B2"));
    workflowAdmissionQueue.release("A");
    await b2;
    expect(order).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("removes a stopped queued run without starting it", async () => {
    setWorkflowEphemeralConcurrencyPolicy({ maxActiveSteps: 1 });
    await workflowAdmissionQueue.acquire("active");
    const queued = workflowAdmissionQueue.acquire("stopped");
    workflowAdmissionQueue.cancel("stopped");
    expect(await queued).toBe(false);
    expect(workflowAdmissionQueue.snapshot().queued).toEqual([]);
  });

  it("keeps a stop tombstone after an active permit was already granted", async () => {
    await workflowAdmissionQueue.acquire("racing-run");
    workflowAdmissionQueue.cancel("racing-run");
    expect(workflowAdmissionQueue.isCancelled("racing-run")).toBe(true);
    expect(await workflowAdmissionQueue.acquire("racing-run")).toBe(false);
  });

  it("blocks primitive reacquire while paused and allows it after resume", async () => {
    await workflowAdmissionQueue.acquire("paused-run");
    workflowAdmissionQueue.pause("paused-run");
    expect(await workflowAdmissionQueue.acquire("paused-run")).toBe(false);
    workflowAdmissionQueue.resume("paused-run");
    expect(await workflowAdmissionQueue.acquire("paused-run")).toBe(true);
  });
});
