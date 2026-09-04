import { describe, expect, it } from "vite-plus/test";

import type { OrchestrationThread } from "@t3tools/contracts";

import {
  findCompletedAnswer,
  isAnsweredPromptInvariant,
  promptIsLatestUserMessage,
} from "./t3team-workflowTurnAnswerLookup.ts";

type Message = OrchestrationThread["messages"][number];

let clock = 0;
function message(id: string, role: Message["role"], text: string, streaming = false): Message {
  clock += 1;
  const at = `2026-09-03T00:00:${String(clock).padStart(2, "0")}.000Z`;
  return { id, role, text, turnId: null, streaming, createdAt: at, updatedAt: at } as Message;
}

const thread = (messages: ReadonlyArray<Message>) => ({ messages }) as OrchestrationThread;

describe("findCompletedAnswer", () => {
  it("returns the first completed assistant reply after the prompt", () => {
    const t = thread([
      message("u1", "user", "older prompt"),
      message("a1", "assistant", "older reply"),
      message("u2", "user", "workflow prompt"),
      message("a2", "assistant", "  the answer  "),
    ]);
    expect(findCompletedAnswer(t, "u2")).toEqual({ messageId: "a2", text: "the answer" });
  });

  it("ignores a still-streaming or empty reply", () => {
    const t = thread([
      message("u2", "user", "prompt"),
      message("a2", "assistant", "partial", true),
      message("a3", "assistant", "   "),
    ]);
    expect(findCompletedAnswer(t, "u2")).toBeNull();
  });

  it("stops at a newer user message — that reply answers a different prompt", () => {
    const t = thread([
      message("u2", "user", "workflow prompt"),
      message("u3", "user", "human steer"),
      message("a3", "assistant", "reply to the steer"),
    ]);
    expect(findCompletedAnswer(t, "u2")).toBeNull();
  });

  it("orders by createdAt, not array position (a NULL-sequence reply sorts first)", () => {
    const prompt = message("u2", "user", "prompt");
    const reply = message("a2", "assistant", "late reply");
    expect(findCompletedAnswer(thread([reply, prompt]), "u2")).toEqual({
      messageId: "a2",
      text: "late reply",
    });
  });

  it("returns null when the prompt is not on the thread", () => {
    expect(findCompletedAnswer(thread([message("a1", "assistant", "x")]), "u9")).toBeNull();
  });
});

describe("promptIsLatestUserMessage", () => {
  it("is true only while no user message follows the prompt", () => {
    const own = thread([message("u2", "user", "prompt"), message("a2", "assistant", "p", true)]);
    expect(promptIsLatestUserMessage(own, "u2")).toBe(true);
    const steered = thread([message("u2", "user", "prompt"), message("u3", "user", "steer")]);
    expect(promptIsLatestUserMessage(steered, "u2")).toBe(false);
  });
});

describe("isAnsweredPromptInvariant", () => {
  it("matches the decider's answered-prompt rejection only", () => {
    expect(
      isAnsweredPromptInvariant("Thread 't' does not end with unanswered user message 'm'."),
    ).toBe(true);
    expect(isAnsweredPromptInvariant("Thread 't' has a turn in progress.")).toBe(false);
  });
});
