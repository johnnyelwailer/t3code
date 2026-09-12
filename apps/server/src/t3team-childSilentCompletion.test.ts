/**
 * Silent-completion notice (GHE #55 follow-up, item 5/6): pure decisions and
 * text. "Did the child report?" is derived from the PARENT's durable
 * transcript (any actor message whose sender is the child), so a stuck child
 * can never hide a finished child by failing to set a flag.
 */
import { describe, expect, it } from "@effect/vitest";

import {
  buildSilentCompletionNotice,
  childAwaitingParentApproval,
  parentReceivedFromChild,
} from "./t3team-childSilentCompletion.ts";

describe("parentReceivedFromChild", () => {
  it("is true when the parent holds an actor message from this child", () => {
    expect(
      parentReceivedFromChild(
        {
          messages: [
            { role: "user" },
            { role: "actor", t3teamExt: { actor: { senderThreadId: "child-1" } } },
          ],
        },
        "child-1",
      ),
    ).toBe(true);
  });

  it("is false when the parent has messages but none from this child", () => {
    expect(
      parentReceivedFromChild(
        {
          messages: [
            { role: "user" },
            { role: "actor", t3teamExt: { actor: { senderThreadId: "other-child" } } },
            { role: "assistant" },
          ],
        },
        "child-1",
      ),
    ).toBe(false);
  });

  it("is false on an empty transcript and ignores non-actor rows", () => {
    expect(parentReceivedFromChild({ messages: [] }, "child-1")).toBe(false);
    expect(
      parentReceivedFromChild(
        { messages: [{ role: "assistant", t3teamExt: { actor: { senderThreadId: "child-1" } } }] },
        "child-1",
      ),
    ).toBe(false);
  });

  it("treats a missing t3teamExt/actor as 'not received'", () => {
    expect(
      parentReceivedFromChild(
        { messages: [{ role: "actor", t3teamExt: null }, { role: "actor" }] },
        "child-1",
      ),
    ).toBe(false);
  });
});

describe("childAwaitingParentApproval", () => {
  it("is true for a plan-mode child that settled with its plan unimplemented", () => {
    expect(
      childAwaitingParentApproval({
        interactionMode: "plan",
        latestTurn: { state: "completed", turnId: "turn-1" },
        proposedPlans: [{ id: "p1", turnId: "turn-1", implementedAt: null, updatedAt: "t1" }],
      }),
    ).toBe(true);
  });

  it("is false when the plan was implemented", () => {
    expect(
      childAwaitingParentApproval({
        interactionMode: "plan",
        latestTurn: { state: "completed", turnId: "turn-1" },
        proposedPlans: [{ id: "p1", turnId: "turn-1", implementedAt: "t2", updatedAt: "t1" }],
      }),
    ).toBe(false);
  });

  it("is false for a non-plan child or a non-settled latest turn", () => {
    expect(
      childAwaitingParentApproval({
        interactionMode: "default",
        latestTurn: { state: "completed", turnId: "turn-1" },
        proposedPlans: [{ id: "p1", turnId: "turn-1", implementedAt: null, updatedAt: "t1" }],
      }),
    ).toBe(false);
    expect(
      childAwaitingParentApproval({
        interactionMode: "plan",
        latestTurn: { state: "running", turnId: "turn-1" },
        proposedPlans: [{ id: "p1", turnId: "turn-1", implementedAt: null, updatedAt: "t1" }],
      }),
    ).toBe(false);
  });

  it("is false when there are no proposed plans at all", () => {
    expect(
      childAwaitingParentApproval({
        interactionMode: "plan",
        latestTurn: { state: "completed", turnId: "turn-1" },
      }),
    ).toBe(false);
  });
});

describe("buildSilentCompletionNotice", () => {
  it("generic wording: finished, decide settle-or-follow-up, names the sweep op", () => {
    const text = buildSilentCompletionNotice({
      childTitle: "Implement the thing",
      childThreadId: "child-1",
      awaitingParentApproval: false,
    });
    expect(text).toContain("[Child completed silently]");
    expect(text).toContain("Implement the thing");
    expect(text).toContain("child-1");
    expect(text).toContain('op:"sweep"');
    expect(text).not.toContain("awaiting your approval");
  });

  it("plan-mode wording: explicitly awaiting approval, do-not-settle-yet", () => {
    const text = buildSilentCompletionNotice({
      childTitle: "Implement the thing",
      childThreadId: "child-1",
      awaitingParentApproval: true,
    });
    expect(text).toContain("[Child awaiting your approval]");
    expect(text).toContain("plan");
    expect(text).toContain("NOT implemented");
    expect(text).not.toContain("[Child completed silently]");
  });
});
