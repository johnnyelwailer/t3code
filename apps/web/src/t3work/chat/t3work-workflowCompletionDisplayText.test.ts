import { describe, expect, it } from "vite-plus/test";
import { workflowCompletionDisplayText } from "./t3work-workflowCompletionDisplayText";

describe("workflowCompletionDisplayText", () => {
  it("shows the human summary from legacy workflow JSON", () => {
    expect(
      workflowCompletionDisplayText(
        "t3work-wf-result:run-1",
        JSON.stringify({
          decision: "approved",
          markers: ["ready", "healthy"],
          summary: "All checks passed.",
        }),
      ),
    ).toBe("All checks passed.");
  });

  it("humanizes a simple legacy object when no summary exists", () => {
    expect(
      workflowCompletionDisplayText(
        "t3work-wf-result:run-1",
        JSON.stringify({ decision: "approved", markers: ["ready", "healthy"] }),
      ),
    ).toBe("**Decision:** approved\n**Markers:** ready, healthy");
  });

  it("does not reinterpret normal assistant output", () => {
    const raw = '{"summary":"Keep this exact JSON"}';
    expect(workflowCompletionDisplayText("assistant-1", raw)).toBe(raw);
  });
});
