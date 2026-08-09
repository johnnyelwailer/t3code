import { describe, expect, it } from "vite-plus/test";

import { parseWorkItemEstimateDraft } from "./t3team-workItemEstimateParsing";

describe("parseWorkItemEstimateDraft", () => {
  it("clears the estimate for a blank draft", () => {
    expect(parseWorkItemEstimateDraft("")).toEqual({ ok: true, value: null });
    expect(parseWorkItemEstimateDraft("   ")).toEqual({ ok: true, value: null });
  });

  it("parses a valid non-negative number", () => {
    expect(parseWorkItemEstimateDraft("5")).toEqual({ ok: true, value: 5 });
    expect(parseWorkItemEstimateDraft(" 2.5 ")).toEqual({ ok: true, value: 2.5 });
    expect(parseWorkItemEstimateDraft("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects a negative number", () => {
    const result = parseWorkItemEstimateDraft("-1");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "Estimate must be a non-negative number." });
  });

  it("rejects non-numeric text", () => {
    const result = parseWorkItemEstimateDraft("five");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "Estimate must be a non-negative number." });
  });

  it("rejects non-finite input", () => {
    expect(parseWorkItemEstimateDraft("Infinity").ok).toBe(false);
  });
});
