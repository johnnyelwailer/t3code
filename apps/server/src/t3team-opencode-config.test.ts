import { describe, expect, it } from "@effect/vitest";

import { resolveOpenCodeConfigContent } from "./provider/opencodeRuntime.ts";

describe("pack-provided OpenCode config", () => {
  it("preserves a declarative per-instance config", () => {
    const config = JSON.stringify({
      provider: { nexplore: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "x" } } },
    });

    expect(resolveOpenCodeConfigContent(config)).toBe(config);
  });

  it.each([undefined, "", "   "])("uses an isolated empty config for %s", (config) => {
    expect(resolveOpenCodeConfigContent(config)).toBe("{}");
  });
});
