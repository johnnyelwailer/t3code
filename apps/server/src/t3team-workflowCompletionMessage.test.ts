import { describe, expect, it } from "vite-plus/test";

import { formatWorkflowOutput } from "./t3team-workflowCompletionMessage.ts";

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
