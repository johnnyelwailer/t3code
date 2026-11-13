import { describe, expect, it } from "vite-plus/test";

import { resolveWelcomeCheck } from "./t3team-welcomeCheck.logic";

describe("resolveWelcomeCheck", () => {
  it("never stays pending: a read that outlives the timeout has failed", () => {
    expect(resolveWelcomeCheck({ pending: true, failed: false, timedOut: false })).toBe("checking");
    expect(resolveWelcomeCheck({ pending: true, failed: false, timedOut: true })).toBe("failed");
  });

  it("reports a failed read as failed and an answered one as settled", () => {
    expect(resolveWelcomeCheck({ pending: false, failed: true, timedOut: false })).toBe("failed");
    expect(resolveWelcomeCheck({ pending: false, failed: false, timedOut: true })).toBe("settled");
  });
});
