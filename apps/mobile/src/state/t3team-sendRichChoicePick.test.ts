import { readT3TeamMessageExtContext } from "@t3tools/contracts";
import { parseRichChoicePayload } from "@t3tools/shared/t3team-richChoicePayload";
import { describe, expect, it, vi } from "vite-plus/test";

const enqueued = vi.hoisted(() => [] as unknown[]);
const failure = vi.hoisted(() => ({ next: null as Error | null }));
vi.mock("./thread-outbox", () => ({
  enqueueThreadOutboxMessage: async (message: unknown) => {
    if (failure.next) throw failure.next;
    enqueued.push(message);
  },
}));

vi.mock("../lib/uuid", () => {
  let next = 0;
  return { uuidv4: () => `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}` };
});

import { sendT3TeamRichChoicePick } from "./t3team-sendRichChoicePick";

const parsed = parseRichChoicePayload({
  prompt: "Pick",
  options: [
    { id: "a", title: "Alpha", body: "x" },
    { id: "b", title: "Beta", body: "y" },
  ],
});
if (!parsed.ok) throw new Error("fixture payload must validate");

const input = {
  environmentId: "env-1" as never,
  threadId: "thread-1" as never,
  widgetId: "w1",
  widgetTitle: "pick_a-role",
  payload: parsed.payload,
  pickedIds: ["a", "b"],
};

describe("sendT3TeamRichChoicePick", () => {
  it("queues the hidden, agent-visible widget action message through the outbox", async () => {
    enqueued.length = 0;
    await sendT3TeamRichChoicePick(input);
    const [message] = enqueued as Array<{
      text: string;
      dispatchMode: string;
      attachments: unknown[];
      environmentId: string;
      threadId: string;
      context: Parameters<typeof readT3TeamMessageExtContext>[0];
    }>;
    expect(message).toMatchObject({
      text: "Widget “pick a role” action: Chose Alpha, Beta (ids: a, b)",
      dispatchMode: "queue",
      attachments: [],
      environmentId: "env-1",
      threadId: "thread-1",
    });
    expect(readT3TeamMessageExtContext(message?.context)).toEqual({
      displayText: "Chose Alpha, Beta (ids: a, b)",
      visibleToUser: false,
      visibleToAgent: true,
      widgetReply: { widgetId: "w1", widgetTitle: "pick a role" },
    });
  });

  it("rejects when the message could not be saved, so the card can offer a retry", async () => {
    failure.next = new Error("disk full");
    await expect(sendT3TeamRichChoicePick(input)).rejects.toThrow("disk full");
    failure.next = null;
  });
});
