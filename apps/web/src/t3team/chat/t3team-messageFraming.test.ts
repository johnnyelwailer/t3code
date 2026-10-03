import { describe, expect, it } from "vite-plus/test";
import { withT3TeamMessageExtContext } from "@t3tools/contracts";

import {
  isHiddenT3TeamFramingMessage,
  t3teamDisplayedUserMessage,
  t3teamMessageExtOf,
} from "./t3team-messageFraming";

describe("isHiddenT3TeamFramingMessage", () => {
  it("hides system-authored user messages and ext-hidden transport", () => {
    expect(isHiddenT3TeamFramingMessage({ createdBy: "system" })).toBe(true);
    expect(
      isHiddenT3TeamFramingMessage({
        createdBy: "user",
        context: withT3TeamMessageExtContext({ visibleToUser: false, displayText: "approve" }),
      }),
    ).toBe(true);
  });

  it("shows people's and agents' messages, including ones with a visible ext", () => {
    expect(isHiddenT3TeamFramingMessage({ createdBy: "user" })).toBe(false);
    expect(isHiddenT3TeamFramingMessage({ createdBy: "agent" })).toBe(false);
    expect(
      isHiddenT3TeamFramingMessage({
        createdBy: "user",
        context: withT3TeamMessageExtContext({ displayText: "Tell me more" }),
      }),
    ).toBe(false);
    expect(isHiddenT3TeamFramingMessage({})).toBe(false);
  });
});

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
