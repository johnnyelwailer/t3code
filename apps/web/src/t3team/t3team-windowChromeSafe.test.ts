import { describe, expect, it } from "vite-plus/test";

import {
  T3TEAM_WINDOW_CHROME_SAFE_ABSOLUTE_CLOSE_CLASS,
  T3TEAM_WINDOW_CHROME_SAFE_CLASS,
} from "./t3team-windowChromeSafe";

describe("window chrome safe-area classes", () => {
  it("reserves the native-controls inset and the traffic-light inset", () => {
    expect(T3TEAM_WINDOW_CHROME_SAFE_CLASS).toContain("wco:pr-(--workspace-native-controls-inset)");
    expect(T3TEAM_WINDOW_CHROME_SAFE_CLASS).toContain("pl-(--workspace-controls-left)");
    expect(T3TEAM_WINDOW_CHROME_SAFE_CLASS).toContain("sm:pl-(--workspace-controls-left)");
    expect(T3TEAM_WINDOW_CHROME_SAFE_CLASS).toContain("drag-region");
  });

  it("moves an absolutely positioned close clear of the caption buttons", () => {
    expect(T3TEAM_WINDOW_CHROME_SAFE_ABSOLUTE_CLOSE_CLASS).toContain(
      "wco:end-[var(--workspace-native-controls-inset)]",
    );
  });
});
