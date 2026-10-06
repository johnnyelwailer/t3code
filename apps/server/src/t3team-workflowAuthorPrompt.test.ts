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
    expect(text).toContain("never call ExitPlanMode");
  });
});
