import { describe, expect, it } from "vite-plus/test";
import { workflowCompletionDisplayText } from "./t3team-workflowCompletionDisplayText";

describe("workflowCompletionDisplayText", () => {
  it("shows the human summary from legacy workflow JSON", () => {
    expect(
      workflowCompletionDisplayText(
        "t3team-wf-result:run-1",
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
        "t3team-wf-result:run-1",
        JSON.stringify({ decision: "approved", markers: ["ready", "healthy"] }),
      ),
    ).toBe("**Decision:** approved\n**Markers:** ready, healthy");
  });

  it("does not reinterpret normal assistant output", () => {
    const raw = '{"summary":"Keep this exact JSON"}';
    expect(workflowCompletionDisplayText("assistant-1", raw)).toBe(raw);
  });

  // GHE (Defect 1): nested objects and arrays-of-objects used to be filtered out before
  // rendering, so a result like this rendered as a bare "Orchestration completed." with the real
  // data silently gone. The rich rendering itself lives in the shared
  // `renderWorkflowRecordAsDisplayText` (see packages/shared/src/t3team-workflowOutputText.ts);
  // these just prove the legacy raw-JSON re-render path is wired to it.
  it("renders an array-of-objects field instead of dropping it", () => {
    const output = workflowCompletionDisplayText(
      "t3team-wf-result:run-1",
      JSON.stringify({
        findings: [
          { title: "Rounding drift in total()", severity: "high", file: "src/cart.ts:4" },
          { title: "checkToken accepts whitespace", severity: "medium", file: "src/auth.ts:3" },
        ],
        summaryStats: { high: 1, medium: 1, low: 0 },
      }),
    );
    expect(output).toContain("Rounding drift in total()");
    expect(output).toContain("checkToken accepts whitespace");
    expect(output).toContain("High: 1, Medium: 1, Low: 0");
    expect(output).not.toBe("Orchestration completed.");
  });

  it("renders a nested object field instead of dropping it", () => {
    const output = workflowCompletionDisplayText(
      "t3team-wf-result:run-1",
      JSON.stringify({ instant: { word: "banana" }, standard: { word: "kiwi" } }),
    );
    expect(output).toContain("Word: banana");
    expect(output).toContain("Word: kiwi");
    expect(output).not.toBe("Orchestration completed.");
  });
});
