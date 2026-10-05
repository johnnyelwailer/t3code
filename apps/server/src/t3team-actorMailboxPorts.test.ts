import { describe, expect, it } from "vite-plus/test";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";
import { toChildrenDrainOutcome } from "./t3team-actorMailboxPorts.ts";
import { isUserStopCommandId } from "./t3team-actorMessageReactor.ts";

const entry = (messageId: string, over: Partial<T3TeamActorMailboxEntry> = {}) =>
  ({
    messageId,
    toThreadId: "target",
    fromThreadId: "sender",
    fromTitle: "Sender",
    text: "Please   rebase\nthe branch",
    urgency: "normal",
    hopCount: 0,
    rootThreadId: "sender",
    createdAt: "2026-10-03T10:00:00.000Z",
    ...over,
  }) satisfies T3TeamActorMailboxEntry;

describe("toChildrenDrainOutcome", () => {
  it("reports delivered digests with one subject per message", () => {
    expect(
      toChildrenDrainOutcome({
        state: "dispatched",
        entries: [entry("a", { summary: "Rebase" }), entry("b")],
      }),
    ).toEqual({
      state: "dispatched",
      delivered: 2,
      subjects: ["Rebase", "Please rebase the branch"],
    });
  });

  it("explains a user-stop hold and a mid-turn wait", () => {
    expect(toChildrenDrainOutcome({ state: "held", pending: [entry("a")] })).toMatchObject({
      state: "held",
      held: 1,
    });
    for (const state of ["busy", "waiting"] as const) {
      expect(toChildrenDrainOutcome({ state, pending: [entry("a")] })).toMatchObject({
        state: "queued",
        queued: 1,
      });
    }
  });
});

describe("isUserStopCommandId", () => {
  it("treats client command ids and the stop cascade as user stops", () => {
    expect(isUserStopCommandId("8a6b6c2e-1f3d-4c5e-9a7b-0c1d2e3f4a5b")).toBe(true);
    expect(isUserStopCommandId("t3team-cascade-stop:event-1:child-1")).toBe(true);
  });

  it("does not treat server or agent stops as user stops", () => {
    expect(isUserStopCommandId(null)).toBe(false);
    expect(isUserStopCommandId("server:t3team:watchdog:run-1")).toBe(false);
    expect(isUserStopCommandId("command:mcp:session:thread-interrupt:key")).toBe(false);
  });
});
