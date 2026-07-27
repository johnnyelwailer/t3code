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
});
