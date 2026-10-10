import { describe, expect, it } from "vite-plus/test";

import {
  ACTOR_STANDING_INSTRUCTION,
  buildActorReactionDigestInput,
} from "./t3team-actorReactionInput.ts";
import { buildActorReactionTurnInput } from "./t3team-actorReactionVisibility.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailboxEntry.ts";

const entry: T3TeamActorMailboxEntry = {
  messageId: "delivery-a",
  toThreadId: "target",
  fromThreadId: "sender",
  fromTitle: "Sender",
  text: "first body",
  urgency: "normal",
  hopCount: 3,
  rootThreadId: "root",
  createdAt: "2026-07-19T08:00:00.000Z",
};

describe("buildActorReactionTurnInput", () => {
  it("returns the bare digest base without the standing instruction", () => {
    expect(buildActorReactionTurnInput([entry], false)).toBe(
      buildActorReactionDigestInput([entry]),
    );
    expect(buildActorReactionTurnInput([entry], false)).not.toContain(ACTOR_STANDING_INSTRUCTION);
  });

  it("appends the standing instruction after the digest base", () => {
    const input = buildActorReactionTurnInput([entry], true);
    const base = buildActorReactionDigestInput([entry]);
    expect(input.startsWith(base)).toBe(true);
    expect(input).toBe(`${base}\n\n${ACTOR_STANDING_INSTRUCTION}`);
  });

  it("appends the human-steering line last, and is deterministic", () => {
    const base = buildActorReactionDigestInput([entry]);
    expect(buildActorReactionTurnInput([entry], true, "[steer]")).toBe(
      `${base}\n\n${ACTOR_STANDING_INSTRUCTION}\n\n[steer]`,
    );
    expect(buildActorReactionTurnInput([entry], false, "[steer]")).toBe(`${base}\n\n[steer]`);
    const second: T3TeamActorMailboxEntry = { ...entry, messageId: "delivery-b", text: "second" };
    expect(buildActorReactionTurnInput([entry, second], true)).toBe(
      buildActorReactionTurnInput([entry, second], true),
    );
  });
});
