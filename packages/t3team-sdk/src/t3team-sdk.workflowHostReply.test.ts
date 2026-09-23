/**
 * `resumeWhileBusy`'s classification, against a real drive slot held busy: only an unreachable
 * journal owes the whole resume; once the reply is durable, a throwing host seam is reported
 * through `report` and never re-sends the reply.
 */

import { describe, expect, it, vi } from "vite-plus/test";

import { createWorkflowHostDriveSlot } from "./t3team-sdk.workflowHostDriveSlot.ts";
import { resumeWhileBusy, type WorkflowReplyInput } from "./t3team-sdk.workflowHostReply.ts";

/** A slot held by a drive the test releases, plus spies for everything `resumeWhileBusy` owes. */
function busySlot(seams: Partial<WorkflowReplyInput>) {
  const slot = createWorkflowHostDriveSlot(() => true);
  const ran: string[] = [];
  let release!: () => void;
  const held = slot.run(() => new Promise<void>((resolve) => (release = resolve)));
  const reply: WorkflowReplyInput = {
    runId: "run-1",
    correlationId: "run-1:1",
    reply: "yes",
    appendReply: async () => true,
    retryResolvedReply: undefined,
    onReplyJournaled: undefined,
    ...seams,
  };
  const report = vi.fn(async (error: unknown) => {
    ran.push(`report ${String((error as Error).message)}`);
  });
  const call = () =>
    resumeWhileBusy({
      slot,
      reply,
      resumeDrive: async () => void ran.push("whole resume"),
      replayDrive: async () => void ran.push("replay"),
      report,
      canDrive: () => true,
    });
  const settle = async () => {
    release();
    await held;
  };
  return { slot, ran, report, call, settle };
}

describe("resumeWhileBusy classification", () => {
  it("owes the whole resume only when the journal stays unreachable after its one retry", async () => {
    const appendReply = vi.fn(async () => {
      throw new Error("journal down");
    });
    const busy = busySlot({ appendReply });
    await busy.call();
    await busy.settle();
    expect(appendReply).toHaveBeenCalledTimes(2);
    expect(busy.ran).toEqual(["whole resume"]);
    expect(busy.report).not.toHaveBeenCalled();
  });

  it("a throwing onReplyJournaled after a durable append reports once and still replays", async () => {
    const appendReply = vi.fn(async () => true);
    const busy = busySlot({
      appendReply,
      onReplyJournaled: async () => {
        throw new Error("sink down");
      },
    });
    await busy.call();
    await busy.settle();
    expect(appendReply).toHaveBeenCalledOnce();
    expect(busy.ran).toEqual(["report sink down", "replay"]);
  });

  it("a throwing retryResolvedReply is reported, replays nothing, and leaves an owed replay intact", async () => {
    const busy = busySlot({
      appendReply: async () => false, // already present
      retryResolvedReply: () => {
        throw new Error("classifier down");
      },
    });
    busy.slot.oweReplay(async () => void busy.ran.push("replay owed by another reply"));
    await busy.call();
    await busy.settle();
    expect(busy.ran).toEqual(["report classifier down", "replay owed by another reply"]);
  });

  it("an already-present reply that is not retry-safe owes nothing", async () => {
    const busy = busySlot({ appendReply: async () => false, retryResolvedReply: () => false });
    await busy.call();
    await busy.settle();
    expect(busy.ran).toEqual([]);
    expect(busy.report).not.toHaveBeenCalled();
  });
});
