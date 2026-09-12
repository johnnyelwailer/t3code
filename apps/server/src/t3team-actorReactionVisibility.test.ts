import { describe, expect, it } from "vite-plus/test";

import { ACTOR_STANDING_INSTRUCTION, buildActorReactionDigestInput } from "./t3team-actorReactionInput.ts";
import { buildActorReactionTurnInput } from "./t3team-actorReactionVisibility.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";

const entry: T3TeamActorMailboxEntry = {
  messageId: "delivery-a",
  fromThreadId: "sender",
  fromTitle: "Sender",
  fromProjectId: "project",
  text: "first body",
  urgency: "normal",
  hopCount: 3,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
  dispatchAttempts: 0,
};

describe("buildActorReactionTurnInput", () => {
  it("returns the bare digest base without the standing instruction", () => {
    expect(buildActorReactionTurnInput([entry], false)).toBe(buildActorReactionDigestInput([entry]));
    expect(buildActorReactionTurnInput([entry], false)).not.toContain(ACTOR_STANDING_INSTRUCTION);
  });

  it("appends the standing instruction as a well-known SUFFIX (rehydrate prefix-matching)", () => {
    const input = buildActorReactionTurnInput([entry], true);
    const base = buildActorReactionDigestInput([entry]);
    expect(input.startsWith(base)).toBe(true);
    expect(input).toBe(`${base}\n\n${ACTOR_STANDING_INSTRUCTION}`);
  });

  it("is deterministic for a given batch and briefing state", () => {
    const second: T3TeamActorMailboxEntry = { ...entry, messageId: "delivery-b", text: "second" };
    expect(buildActorReactionTurnInput([entry, second], true)).toBe(
      buildActorReactionTurnInput([entry, second], true),
    );
  });
});
