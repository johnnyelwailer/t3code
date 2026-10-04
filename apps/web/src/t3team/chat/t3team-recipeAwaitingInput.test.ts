import { describe, expect, it } from "vite-plus/test";
import { withT3TeamMessageExtContext } from "@t3tools/contracts";

import { isThreadWaitingForRecipeInput } from "./t3team-recipeAwaitingInput";

const ask = {
  role: "system",
  context: withT3TeamMessageExtContext({ status: "waiting-for-input" }),
};
const reply = { role: "user", createdBy: "user" as const };
const note = { role: "assistant" };

describe("isThreadWaitingForRecipeInput", () => {
  it("is waiting while the latest workflow ask has no user reply after it", () => {
    expect(isThreadWaitingForRecipeInput([reply, ask])).toBe(true);
    expect(isThreadWaitingForRecipeInput([ask, note])).toBe(true);
  });

  it("stops waiting once the user replies, and waits again on a newer ask", () => {
    expect(isThreadWaitingForRecipeInput([ask, reply])).toBe(false);
    expect(isThreadWaitingForRecipeInput([ask, reply, ask])).toBe(true);
  });

  it("keeps waiting through user-role messages the person did not write", () => {
    // A child's completion wake / mailbox delivery (agent) and a retry continuation or queued
    // workflow prompt (system) are user-role, but none of them answers the ask.
    const wake = { role: "user", createdBy: "agent" as const };
    const continuation = { role: "user", createdBy: "system" as const };
    expect(isThreadWaitingForRecipeInput([ask, wake])).toBe(true);
    expect(isThreadWaitingForRecipeInput([ask, continuation])).toBe(true);
    expect(isThreadWaitingForRecipeInput([ask, wake, reply])).toBe(false);
  });

  it("ignores messages without the ext status and empty threads", () => {
    expect(isThreadWaitingForRecipeInput([note, { role: "system" }])).toBe(false);
    expect(isThreadWaitingForRecipeInput([])).toBe(false);
    expect(isThreadWaitingForRecipeInput(undefined)).toBe(false);
  });
});
