import { describe, expect, it } from "vite-plus/test";
import { MessageId, withT3TeamMessageExtContext } from "@t3tools/contracts";

import { deriveTimelineEntriesFromVisibleTurnItems } from "~/session-logic";
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

describe("optimistic rows", () => {
  it("show the typed words of a work-item send before the server echo lands", () => {
    const optimistic = {
      id: MessageId.make("message-optimistic"),
      role: "user" as const,
      text: "PROJ-1: Fix the login…\n\nplease take a look",
      context: withT3TeamMessageExtContext({ displayText: "please take a look" }),
      runId: null,
      streaming: false,
      createdAt: "2026-10-04T10:00:00.000Z",
      updatedAt: "2026-10-04T10:00:00.000Z",
    };
    const derive = () =>
      deriveTimelineEntriesFromVisibleTurnItems({
        visibleTurnItems: [],
        optimisticMessages: [optimistic],
      });

    const [entry] = derive();

    expect(entry?.kind === "message" ? t3teamDisplayedUserMessage(entry.message).text : null).toBe(
      "please take a look",
    );
    // The derived row keeps its identity across re-derives (rows stay memoized).
    const [again] = derive();
    expect(again?.kind === "message" && entry?.kind === "message" && again.message).toBe(
      entry?.kind === "message" ? entry.message : null,
    );
  });
});
