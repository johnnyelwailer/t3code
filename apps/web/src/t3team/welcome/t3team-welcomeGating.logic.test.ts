import { describe, expect, it } from "vite-plus/test";

import { isNexiWelcomeSetupEnabled, NEXI_WELCOME_SETUP_FLAG } from "./t3team-welcomeGating.logic";

describe("isNexiWelcomeSetupEnabled", () => {
  it("defaults off when the server has no featureFlags map", () => {
    expect(isNexiWelcomeSetupEnabled(null)).toBe(false);
    expect(isNexiWelcomeSetupEnabled({})).toBe(false);
  });

  it("follows the server-advertised flag", () => {
    expect(isNexiWelcomeSetupEnabled({ featureFlags: { [NEXI_WELCOME_SETUP_FLAG]: true } })).toBe(
      true,
    );
    expect(isNexiWelcomeSetupEnabled({ featureFlags: { [NEXI_WELCOME_SETUP_FLAG]: false } })).toBe(
      false,
    );
  });
});
