import { describe, expect, it } from "vite-plus/test";

import type { ServerConfig } from "@t3tools/contracts";

import { isT3TeamContextChatTabEnabled } from "./t3team-contextChatTabFlag";

describe("isT3TeamContextChatTabEnabled", () => {
  it("is off without a server config or a flag map", () => {
    expect(isT3TeamContextChatTabEnabled(null)).toBe(false);
    expect(isT3TeamContextChatTabEnabled({} as ServerConfig)).toBe(false);
  });

  it("follows the server's flag map", () => {
    const config = (value: boolean) =>
      ({ featureFlags: { CONTEXT_CHAT_TAB: value } }) as unknown as ServerConfig;
    expect(isT3TeamContextChatTabEnabled(config(true))).toBe(true);
    expect(isT3TeamContextChatTabEnabled(config(false))).toBe(false);
  });
});
