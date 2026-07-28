import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkflowFailureText,
  formatWorkflowOutput,
} from "./t3team-workflowCompletionMessage.ts";

describe("formatWorkflowOutput", () => {
  it("uses a human summary instead of exposing the structured result", () => {
    expect(
      formatWorkflowOutput({
        decision: "approved",
        markers: ["one", "two"],
        summary: "All checks passed.",
      }),
    ).toBe("All checks passed.");
  });

  it("humanizes simple structured output without raw JSON", () => {
    const output = formatWorkflowOutput({ decision: "approved", count: 3 });
    expect(output).toContain("**Decision:** approved");
    expect(output).toContain("**Count:** 3");
    expect(output).not.toContain("{");
  });
});

describe("buildWorkflowFailureText", () => {
  it("tells an agent that owns the source to fix and relaunch", () => {
    const text = buildWorkflowFailureText({ errorText: "boom", hostOwnsSource: true });
    expect(text).toContain("Fix the orchestration source");
    expect(text).toContain('t3team_help("agent-orchestration")');
  });

  it("tells a human on a bundled recipe what they can actually do", () => {
    const text = buildWorkflowFailureText({ errorText: "boom", hostOwnsSource: false });
    // A person who clicked a button cannot edit shipped recipe source, and t3team_help is not theirs.
    expect(text).not.toContain("Fix the orchestration source");
    expect(text).not.toContain("t3team_help");
    expect(text).toContain("nothing was saved");
    expect(text).toContain("start it again");
  });
});
