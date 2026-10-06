import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

const isJson = Schema.is(Schema.Json);

describe("okResult structuredContent", () => {
  it("omits undefined-valued keys so the MCP CallToolResult schema (Schema.Json) accepts it", () => {
    const result = okResult({
      runId: "run-1",
      status: "running",
      pendingKind: undefined,
      wakeAt: undefined,
      nested: { keep: 1, drop: undefined },
      list: [{ a: 1, b: undefined }],
    });

    expect(result.structuredContent).toEqual({
      runId: "run-1",
      status: "running",
      nested: { keep: 1 },
      list: [{ a: 1 }],
    });
    expect(isJson(result.structuredContent)).toBe(true);
  });

  it("keeps the text block and structured payload identical", () => {
    const result = okResult({ a: 1, b: undefined });
    expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual(result.structuredContent);
  });

  it("leaves error results valid JSON", () => {
    expect(isJson(errorResult("boom").structuredContent)).toBe(true);
  });
});
