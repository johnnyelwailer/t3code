import { describe, expect, it } from "@effect/vitest";

import { rankHandbookDocuments, tokenizeHandbookText } from "./t3team-handbookBm25.ts";
import { HANDBOOK_FIXTURE_DOCUMENTS } from "./__fixtures__/t3team-handbookPages.ts";

describe("tokenizeHandbookText", () => {
  it("lowercases and drops single-character tokens", () => {
    expect(tokenizeHandbookText("A MCP tool's Auth")).toEqual(["mcp", "tool's", "auth"]);
  });
});

describe("rankHandbookDocuments", () => {
  it("ranks authentication ahead of unrelated pages", () => {
    const hits = rankHandbookDocuments(
      "GH_ENTERPRISE_TOKEN authentication",
      HANDBOOK_FIXTURE_DOCUMENTS,
      3,
    );
    expect(hits[0]?.path).toBe("Source/docs/getting-started/authentication.md");
    expect(hits[0]?.score).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.score > 0)).toBe(true);
  });

  it("boosts title and path matches for mcp tools", () => {
    const hits = rankHandbookDocuments("handbook mcp tools", HANDBOOK_FIXTURE_DOCUMENTS, 2);
    expect(hits[0]?.path).toBe("Source/docs/platforms/mcp-tools.mdx");
    expect(hits[0]?.title).toBe("Host MCP tools");
  });

  it("returns no hits for empty or whitespace queries", () => {
    expect(rankHandbookDocuments("   ", HANDBOOK_FIXTURE_DOCUMENTS, 5)).toEqual([]);
    expect(rankHandbookDocuments("a", HANDBOOK_FIXTURE_DOCUMENTS, 5)).toEqual([]);
  });

  it("respects the result limit", () => {
    expect(rankHandbookDocuments("sessions cloud", HANDBOOK_FIXTURE_DOCUMENTS, 1)).toHaveLength(1);
  });
});
