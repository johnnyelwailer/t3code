import { describe, expect, it } from "vite-plus/test";

import * as OpenCodeRuntime from "./OpenCodeRuntime.ts";

describe("resolveOpenCodeConfigContent", () => {
  it("prefers the caller environment over the inherited environment", () => {
    expect(
      OpenCodeRuntime.resolveOpenCodeConfigContent(
        undefined,
        { OPENCODE_CONFIG_CONTENT: '{"source":"caller"}' },
        { OPENCODE_CONFIG_CONTENT: '{"source":"process"}' },
      ),
    ).toBe('{"source":"caller"}');
  });

  it("falls back to the inherited environment and then an empty config", () => {
    expect(
      OpenCodeRuntime.resolveOpenCodeConfigContent(undefined, undefined, {
        OPENCODE_CONFIG_CONTENT: '{"source":"process"}',
      }),
    ).toBe('{"source":"process"}');
    expect(OpenCodeRuntime.resolveOpenCodeConfigContent(undefined, undefined, {})).toBe("{}");
  });

  it("prefers explicit config content over any environment", () => {
    expect(
      OpenCodeRuntime.resolveOpenCodeConfigContent(
        '{"source":"settings"}',
        { OPENCODE_CONFIG_CONTENT: '{"source":"caller"}' },
        { OPENCODE_CONFIG_CONTENT: '{"source":"process"}' },
      ),
    ).toBe('{"source":"settings"}');
  });
});
