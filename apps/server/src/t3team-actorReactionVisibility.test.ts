import { MessageId, TurnId, type OrchestrationMessage } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import { buildActorReactionInput } from "./t3team-actorReactionInput.ts";
import {
  ACTOR_REACTION_USER_RETURN_INSTRUCTION,
  appendActorReactionUserReturnInstruction,
  buildActorReactionTurnInput,
  detectUserFacingOpenState,
} from "./t3team-actorReactionVisibility.ts";

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;
// Fixed timestamps: the detection keys on createdAt with `>=`, so on equal
// timestamps the later (array-ordered) message wins — which matches the
// chronological array order these tests build. The one test that checks
// createdAt ordering overrides createdAt explicitly.
function message(
  overrides: Partial<OrchestrationMessage> & { role: OrchestrationMessage["role"] },
): OrchestrationMessage {
  const id = nextId("msg");
  const createdAt = "2026-07-19T08:00:00.000Z";
  return {
    id: MessageId.make(id),
    text: "body",
    turnId: TurnId.make(nextId("turn")),
    streaming: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  } as OrchestrationMessage;
}

const entry: T3TeamActorMailboxEntry = {
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

describe("detectUserFacingOpenState", () => {
  it("is open/unreacted when only inter-agent inputs and assistant reactions exist", () => {
    const messages = [
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
        },
      }),
      message({ role: "assistant" }),
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 2, rootThreadId: "r" },
        },
      }),
    ];
    // The last user-facing message is the assistant reaction (the actor inputs
    // are not user-facing) → unreacted response.
    expect(detectUserFacingOpenState(messages)).toEqual({
      kind: "open",
      reason: "unreacted-response",
    });
  });

  it("is closed only when there is no user or assistant message at all", () => {
    const messages = [
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
        },
      }),
    ];
    expect(detectUserFacingOpenState(messages)).toEqual({ kind: "closed" });
  });

  it("is open/unanswered-user-message when the tail is a human user message", () => {
    const messages = [
      message({ role: "user", text: "hi" }),
      message({ role: "assistant", text: "hello" }),
      message({ role: "user", text: "now do X" }),
    ];
    expect(detectUserFacingOpenState(messages)).toEqual({
      kind: "open",
      reason: "unanswered-user-message",
    });
  });

  it("is open/unreacted-response when the tail is an assistant response", () => {
    const messages = [
      message({ role: "user", text: "hi" }),
      message({ role: "assistant", text: "hello, done" }),
    ];
    expect(detectUserFacingOpenState(messages)).toEqual({
      kind: "open",
      reason: "unreacted-response",
    });
  });

  it("ignores inter-agent (actor) and automated (author) user-role inputs", () => {
    const messages = [
      message({ role: "user", text: "real question" }),
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
        },
      }),
      message({
        role: "user",
        t3teamExt: { author: { kind: "system" } },
      }),
    ];
    // Tail user-facing is the real user message → unanswered.
    expect(detectUserFacingOpenState(messages)).toEqual({
      kind: "open",
      reason: "unanswered-user-message",
    });
  });

  it("uses the latest user-facing message by createdAt, not array order", () => {
    const messages = [
      message({ role: "assistant", text: "early", createdAt: "2026-07-19T07:00:00.000Z" }),
      message({ role: "user", text: "later", createdAt: "2026-07-19T09:00:00.000Z" }),
    ];
    expect(detectUserFacingOpenState(messages)).toEqual({
      kind: "open",
      reason: "unanswered-user-message",
    });
  });
});

describe("harness instruction trigger (GHE #156)", () => {
  it("injects the instruction when inter-agent msgs + unanswered user msg", () => {
    const context = detectUserFacingOpenState([message({ role: "user", text: "do X" })]);
    const input = buildActorReactionTurnInput([entry], context);
    expect(input).toContain(ACTOR_REACTION_USER_RETURN_INSTRUCTION);
    // The stable base framing is still present (prefix).
    expect(input.startsWith(buildActorReactionInput(entry))).toBe(true);
  });

  it("injects the instruction when inter-agent msgs + unreacted response", () => {
    const context = detectUserFacingOpenState([
      message({ role: "user", text: "hi" }),
      message({ role: "assistant", text: "done" }),
    ]);
    const input = buildActorReactionTurnInput([entry], context);
    expect(input).toContain(ACTOR_REACTION_USER_RETURN_INSTRUCTION);
  });

  it("does NOT inject the instruction when there is no open user-facing exchange", () => {
    const context = detectUserFacingOpenState([
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
        },
      }),
    ]);
    const input = buildActorReactionTurnInput([entry], context);
    expect(input).not.toContain(ACTOR_REACTION_USER_RETURN_INSTRUCTION);
    // Falls back to the exact base framing.
    expect(input).toBe(buildActorReactionInput(entry));
  });

  it("requires the agent to RE-STATE earlier user-facing content", () => {
    expect(ACTOR_REACTION_USER_RETURN_INSTRUCTION).toContain("RE-STATE");
    expect(ACTOR_REACTION_USER_RETURN_INSTRUCTION).toContain("do NOT assume the user still has it");
  });

  it("requires the LAST action to be responding to the user", () => {
    expect(ACTOR_REACTION_USER_RETURN_INSTRUCTION).toContain(
      "your LAST action must be to respond to the user",
    );
  });

  it("appendActorReactionUserReturnInstruction is a no-op for a closed context", () => {
    const base = buildActorReactionInput(entry);
    const closed = detectUserFacingOpenState([
      message({
        role: "user",
        t3teamExt: {
          actor: { senderThreadId: "s", urgency: "normal", hopCount: 1, rootThreadId: "r" },
        },
      }),
    ]);
    expect(appendActorReactionUserReturnInstruction(base, closed)).toBe(base);
  });
});
