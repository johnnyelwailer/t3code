import { MessageId, TurnId, type OrchestrationMessage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveActorReplyContext } from "./t3team-actorReactionContext.ts";

const message = (
  id: string,
  role: OrchestrationMessage["role"],
  hopCount: number,
): OrchestrationMessage => ({
  id: MessageId.make(id),
  role,
  text: id,
  t3teamExt: {
    visibleToUser: role !== "user",
    actor: {
      senderThreadId: "peer",
      urgency: "normal",
      hopCount,
      rootThreadId: `root-${hopCount}`,
    },
  },
  turnId: role === "user" ? TurnId.make("reaction-turn") : null,
  streaming: false,
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
});

describe("deriveActorReplyContext", () => {
  it("keeps the active reaction hop when lower-hop actor cards interleave", () => {
    const context = deriveActorReplyContext(
      [message("reaction-input", "user", 5), message("newer-card", "actor", 0)],
      "sender",
    );

    expect(context).toEqual({ hopCount: 6, rootThreadId: "root-5" });
  });

  it("starts a fresh chain from a normal user turn", () => {
    const normalUser = { ...message("human-input", "user", 4), t3teamExt: undefined };
    expect(deriveActorReplyContext([normalUser], "sender")).toEqual({
      hopCount: 0,
      rootThreadId: "sender",
    });
  });
});
