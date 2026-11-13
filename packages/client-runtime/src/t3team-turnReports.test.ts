import { describe, expect, it } from "vite-plus/test";

import {
  T3TEAM_TURN_REPORT_MIN_CHARS,
  t3teamTurnReportIds,
  type T3teamTurnReportEntry,
} from "./t3team-turnReports.ts";

const say = (id: string, length: number): T3teamTurnReportEntry => ({
  id,
  assistantText: ` ${"ä".repeat(length)} `,
  answersQuestion: false,
});
const tool: T3teamTurnReportEntry = { id: "tool", assistantText: null, answersQuestion: false };
const answer: T3teamTurnReportEntry = { id: "answer", assistantText: null, answersQuestion: true };
const min = T3TEAM_TURN_REPORT_MIN_CHARS;

describe("t3teamTurnReportIds", () => {
  it.each([
    ["a note below the threshold folds", [say("note", min - 1), tool], []],
    ["a report at the threshold stays", [say("report", min), tool], ["report"]],
    ["every long report stays", [say("a", min * 3), tool, say("b", min)], ["a", "b"]],
    ["the message before an answered question stays", [say("ask", 20), tool, answer], ["ask"]],
    ["an answer with no message before it keeps nothing", [answer, say("after", 5)], []],
  ])("%s", (_name, entries, expected) => {
    expect([...t3teamTurnReportIds(entries)]).toEqual(expected);
  });
});
