// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { primaryEnvironmentLabel } from "./t3team-localEnvironmentLabel";

describe("primaryEnvironmentLabel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls a loopback-served primary this computer", () => {
    vi.stubGlobal("location", new URL("http://localhost:16531/"));
    expect(primaryEnvironmentLabel("NX-MN94KQCLWQ")).toBe("This computer");
  });

  it("keeps a networked primary's own name", () => {
    vi.stubGlobal("location", new URL("https://devbox.example.com/"));
    expect(primaryEnvironmentLabel("devbox")).toBe("devbox");
  });
});
