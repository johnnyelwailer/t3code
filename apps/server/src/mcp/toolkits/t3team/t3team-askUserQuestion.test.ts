import { describe, expect, it } from "vite-plus/test";

import { buildAskUserQuestion } from "./t3team-askUserQuestion.ts";

const LONG_QUESTION =
  "Which of the two migration strategies should this thread follow for the billing tables rollout?";

const build = (input: Parameters<typeof buildAskUserQuestion>[0]) => {
  const built = buildAskUserQuestion(input, "q-1");
  if ("error" in built) throw new Error(built.error);
  return built;
};

describe("buildAskUserQuestion", () => {
  it("rejects an empty question", () => {
    expect(buildAskUserQuestion({ question: "   " }, "q-1")).toEqual({
      error: "t3team_ask_user requires a non-empty 'question'.",
    });
  });

  it("maps header, structured options, multiSelect and allowFreeText:false", () => {
    const { question } = build({
      question: LONG_QUESTION,
      header: " Strategy ",
      options: ["Blue-green", { label: "In place", description: "Faster, but locks tables" }],
      multiSelect: true,
      allowFreeText: false,
    });
    expect(question).toEqual({
      id: "q-1",
      header: "Strategy",
      question: LONG_QUESTION,
      options: [
        { label: "Blue-green", description: "Blue-green" },
        { label: "In place", description: "Faster, but locks tables" },
      ],
      multiSelect: true,
      allowCustomAnswer: false,
    });
  });

  it("keeps free text allowed by default and without options", () => {
    expect(build({ question: LONG_QUESTION }).question.allowCustomAnswer).toBeUndefined();
    expect(
      build({ question: LONG_QUESTION, allowFreeText: false }).question.allowCustomAnswer,
    ).toBeUndefined();
    expect(build({ question: LONG_QUESTION }).question.header).toBe("Question");
  });

  it("places context above the question so the dock card and the answer carry it", () => {
    const { question, warnings } = build({ question: "Which one?", context: "  ## Options\n- A " });
    expect(question.question).toBe("## Options\n- A\n\nWhich one?");
    expect(warnings).toEqual([]);
  });

  it("warns about options restating their label and short questions without context", () => {
    const { warnings } = build({ question: "Continue?", context: "   ", options: ["Yes"] });
    expect(warnings).toEqual([
      "option 'Yes': its description restates the label — describe the trade-off instead",
      "question references prior content but no context was provided — pass the referenced content in 'context'",
    ]);
    expect(build({ question: LONG_QUESTION }).warnings).toEqual([]);
  });
});
