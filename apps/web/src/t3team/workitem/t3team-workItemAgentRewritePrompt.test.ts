import { describe, expect, it } from "vite-plus/test";

import { buildWorkItemAgentRewritePrompt } from "./t3team-workItemAgentRewritePrompt";

describe("buildWorkItemAgentRewritePrompt", () => {
  it("names the issue, the draft tool, and the do-not-apply instruction", () => {
    const prompt = buildWorkItemAgentRewritePrompt({
      issueIdOrKey: "PROJ-42",
      descriptionText: "Old description text.",
      summary: "Fix the login bug",
    });

    expect(prompt).toContain("PROJ-42");
    expect(prompt).toContain("t3team.work_item.description.draft_update");
    expect(prompt).toContain("do not apply the change yourself");
    expect(prompt).toContain("Old description text.");
    expect(prompt).toContain("Fix the login bug");
  });

  it("says there is no description yet when the field is empty", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-7" });

    expect(prompt).toContain("It has no description yet.");
    expect(prompt).not.toContain("Current description:");
  });

  it("tells the agent a human reviews before anything reaches Jira", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-1" });

    expect(prompt).toContain("A human will review your proposal");
  });

  it("tells the agent to call the tool directly, exactly once, and never author a workflow", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-42" });

    expect(prompt).toContain("Call the t3team.work_item.description.draft_update tool directly, exactly once");
    expect(prompt).toContain("do not author, launch, or run a workflow or orchestration");
  });

  it("omits the parenthetical when there is no summary", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-9" });

    expect(prompt).toContain("Rewrite the description of PROJ-9.");
  });

  it("omits the parenthetical when the summary is blank", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-9", summary: "   " });

    expect(prompt).toContain("Rewrite the description of PROJ-9.");
  });

  it("omits the parenthetical when the summary is just the issue key (e.g. a generic loading fallback)", () => {
    const prompt = buildWorkItemAgentRewritePrompt({ issueIdOrKey: "PROJ-9", summary: "PROJ-9" });

    expect(prompt).toContain("Rewrite the description of PROJ-9.");
    expect(prompt).not.toContain("(PROJ-9)");
  });
});
