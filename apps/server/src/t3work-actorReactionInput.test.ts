import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildActorReactionInput,
  collectPendingActorDeliveries,
} from "./t3work-actorReactionInput.ts";
import type { T3workActorMailboxEntry } from "./t3work-actorMailbox.ts";

const entry: T3workActorMailboxEntry = {
  messageId: "delivery-a",
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  text: "first",
  urgency: "normal",
  hopCount: 3,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
};

const delivered = (messageId: string, text: string): OrchestrationEvent =>
  ({
    type: "thread.actor-message-delivered",
    payload: { ...entry, threadId: "target", messageId, text },
  }) as unknown as OrchestrationEvent;

describe("collectPendingActorDeliveries", () => {
  it("rehydrates only actor deliveries without a durable reaction input", () => {
    const reactedEntry = { ...entry, messageId: "delivery-a", text: "first" };
    const events = [
      delivered("delivery-a", "first"),
      delivered("delivery-b", "second"),
      {
        type: "thread.message-sent",
        payload: {
          threadId: "target",
          role: "user",
          text: buildActorReactionInput(reactedEntry),
          t3workExt: {
            visibleToUser: false,
            actor: {
              senderThreadId: "sender",
              urgency: "normal",
              hopCount: 3,
              rootThreadId: "root",
            },
          },
        },
      } as unknown as OrchestrationEvent,
    ];

    expect(collectPendingActorDeliveries(events, 6)).toEqual([
      expect.objectContaining({
        threadId: "target",
        entry: expect.objectContaining({ messageId: "delivery-b", text: "second" }),
      }),
    ]);
  });
});
