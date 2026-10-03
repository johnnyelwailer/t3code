import { describe, expect, it } from "vite-plus/test";

import { t3teamUserInputAnswerText } from "./t3team-userInputAnswerText.ts";

describe("t3teamUserInputAnswerText", () => {
  it("trims a string answer and treats blank as unanswered", () => {
    expect(t3teamUserInputAnswerText("  Ship it ")).toBe("Ship it");
    expect(t3teamUserInputAnswerText("   ")).toBeNull();
  });

  it("joins multi-select labels with a bullet so comma labels stay unambiguous", () => {
    expect(t3teamUserInputAnswerText(["Red, bold", " Blue "])).toBe("Red, bold • Blue");
  });

  it("treats an empty selection or a non-text answer as unanswered", () => {
    expect(t3teamUserInputAnswerText([])).toBeNull();
    expect(t3teamUserInputAnswerText(["  ", 3])).toBeNull();
    expect(t3teamUserInputAnswerText(undefined)).toBeNull();
    expect(t3teamUserInputAnswerText({ label: "x" })).toBeNull();
  });
});
