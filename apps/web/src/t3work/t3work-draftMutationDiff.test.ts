import { describe, expect, it } from "vite-plus/test";
import { buildDraftTextDiff, draftContentToComparableText } from "./t3work-draftMutationDiff";

describe("draftContentToComparableText", () => {
  it("converts rich html into comparable text", () => {
    expect(
      draftContentToComparableText({
        format: "html",
        body: "<h2>Plan</h2><p>Ship retries.</p>",
      }),
    ).toContain("Plan");
  });
});

describe("buildDraftTextDiff", () => {
  it("marks added and removed draft lines", () => {
    const rows = buildDraftTextDiff({
      current: { format: "markdown", body: "First\nOld line\nLast" },
      proposed: { format: "markdown", body: "First\nNew line\nLast\nExtra" },
    });

    expect(rows).toEqual([
      { type: "unchanged", text: "First" },
      { type: "removed", text: "Old line" },
      { type: "added", text: "New line" },
      { type: "unchanged", text: "Last" },
      { type: "added", text: "Extra" },
    ]);
  });
});
