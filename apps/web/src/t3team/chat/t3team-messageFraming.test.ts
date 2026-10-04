import { describe, expect, it } from "vite-plus/test";
import { withT3TeamMessageExtContext } from "@t3tools/contracts";

import { t3teamDisplayedUserMessage, t3teamMessageExtOf } from "./t3team-messageFraming";

describe("t3teamMessageExtOf", () => {
  it("spreads the ext a message carries and nothing otherwise", () => {
    const context = withT3TeamMessageExtContext({ displayText: "Tell me more" });
    expect(t3teamMessageExtOf({ context })).toEqual({
      t3teamExt: { displayText: "Tell me more" },
    });
    expect(t3teamMessageExtOf({ context })).toEqual(t3teamMessageExtOf({ context }));
    expect(t3teamMessageExtOf({})).toEqual({});
    expect(t3teamMessageExtOf({ context: { version: 1, records: [] } })).toEqual({});
  });
});

describe("t3teamDisplayedUserMessage", () => {
  it("shows the typed words of a send whose prompt carries appended work-item context", () => {
    const message = {
      text: "PROJ-1: Fix the login…\n\nplease take a look",
      t3teamExt: { displayText: "please take a look" },
    };
    expect(t3teamDisplayedUserMessage(message).text).toBe("please take a look");
    const plain = { text: "hello" };
    expect(t3teamDisplayedUserMessage(plain)).toBe(plain);
  });
});
