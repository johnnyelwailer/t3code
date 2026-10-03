import { describe, expect, it } from "vite-plus/test";
import { withT3TeamMessageExtContext } from "@t3tools/contracts";

import { isThreadWaitingForRecipeInput } from "./t3team-recipeAwaitingInput";

const ask = {
  role: "system",
  context: withT3TeamMessageExtContext({ status: "waiting-for-input" }),
};
const reply = { role: "user" };
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

  it("ignores messages without the ext status and empty threads", () => {
    expect(isThreadWaitingForRecipeInput([note, { role: "system" }])).toBe(false);
    expect(isThreadWaitingForRecipeInput([])).toBe(false);
    expect(isThreadWaitingForRecipeInput(undefined)).toBe(false);
  });
});
