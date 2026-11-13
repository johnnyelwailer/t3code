import { describe, expect, it } from "vite-plus/test";

import { buildWorkflowAuthorKickoff } from "./t3team-workflowAuthorPrompt.ts";

const intent = { goal: "g", expectedOutcome: "o", guardrails: ["x"] };

describe("workflow author kickoff", () => {
  // The hidden author runs in plan mode (t3team-workflowAuthorTurn.ts). A Claude author left to
  // the harness's plan-mode reminder called ExitPlanMode instead of launching, was told to stop
  // and wait for a user who never reads this thread, and failed the run (E2E V2 F2: 3/5).
  it("tells the author that plan mode does not gate its launch tool", () => {
    const text = buildWorkflowAuthorKickoff({ intent, args: {} });
    expect(text).toContain("plan mode only to withhold edit and shell tools");
    expect(text).toContain("Never call ExitPlanMode");
  });

  // The 45-60 KB kickoff made the Nexplore conductor tier reason ~65 KB per try and end without a
  // tool call (runs 0315658c, 7579e37a, 822ef5ab). Growth past this cap needs a measured reason
  // (apps/server/scripts/t3team-workflowAuthorEval.ts), not a paragraph.
  it("stays under the size budget a small model can act on", () => {
    expect(buildWorkflowAuthorKickoff({ intent, args: {} }).length).toBeLessThan(12_000);
  });

  // The author's submission is bound to its run; demanding `intent` again was a needless shape to
  // get wrong on the first call.
  it("asks for the source alone on submission", () => {
    const text = buildWorkflowAuthorKickoff({ intent, args: {} });
    expect(text).toContain("t3_orchestration_run({ source })");
    expect(text).not.toContain("{ source, intent }");
  });
});
