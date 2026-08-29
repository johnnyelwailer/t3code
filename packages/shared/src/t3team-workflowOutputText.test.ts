import { describe, expect, it } from "vite-plus/test";

import { renderWorkflowRecordAsDisplayText } from "./t3team-workflowOutputText.ts";

const render = (record: Record<string, unknown>) =>
  renderWorkflowRecordAsDisplayText(record, { emptyFallback: "Nothing to show." });

describe("renderWorkflowRecordAsDisplayText", () => {
  it("short-circuits on a summary/message/text/result string", () => {
    expect(
      render({ decision: "approved", markers: ["one", "two"], summary: "All checks passed." }),
    ).toBe("All checks passed.");
  });

  it("humanizes flat scalar and scalar-array fields inline, as before", () => {
    const output = render({ decision: "approved", markers: ["ready", "healthy"] });
    expect(output).toBe("**Decision:** approved\n**Markers:** ready, healthy");
  });

  it("renders an array of flat objects instead of dropping it", () => {
    const output = render({
      findings: [
        { title: "Rounding drift in total()", severity: "high", file: "src/cart.ts:4" },
        { title: "checkToken accepts whitespace", severity: "medium", file: "src/auth.ts:3" },
      ],
      summaryStats: { high: 1, medium: 1, low: 0 },
    });
    expect(output).toContain("Rounding drift in total()");
    expect(output).toContain("checkToken accepts whitespace");
    expect(output).toContain("src/cart.ts:4");
    expect(output).toContain("src/auth.ts:3");
    expect(output).toContain("High: 1, Medium: 1, Low: 0");
    expect(output).not.toBe("Nothing to show.");
  });

  it("renders a nested flat object instead of dropping it", () => {
    const output = render({
      instant: { word: "banana" },
      standard: { word: "kiwi" },
    });
    expect(output).toContain("Word: banana");
    expect(output).toContain("Word: kiwi");
  });

  it("falls back to a fenced JSON block for a deeply-nested field, never dropping it", () => {
    const output = render({
      before: { status: "draft", meta: { owner: "alice" } },
      after: { status: "published", meta: { owner: "alice", publishedAt: "2026-01-01" } },
      artifactId: "art-1",
      artifactType: "document",
    });
    expect(output).toContain("**Artifact Id:** art-1");
    expect(output).toContain("**Artifact Type:** document");
    expect(output).toContain('"status": "draft"');
    expect(output).toContain('"status": "published"');
    expect(output).toContain("```json");
  });

  it("returns the caller's own fallback when nothing is readable", () => {
    expect(render({})).toBe("Nothing to show.");
  });

  it("truncates a very large result visibly instead of dumping it unbounded", () => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < 500; index += 1) {
      record[`field${index}`] = `value-${index}-${"x".repeat(40)}`;
    }
    const output = render(record);
    expect(output.length).toBeLessThan(9000);
    expect(output).toContain("truncated");
  });

  it("caps a very long array visibly instead of listing every item", () => {
    const findings = Array.from({ length: 50 }, (_, index) => ({ title: `finding-${index}` }));
    const output = render({ findings });
    expect(output).toContain("finding-0");
    expect(output).toContain("and 30 more");
  });
});
