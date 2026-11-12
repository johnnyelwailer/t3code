import { describe, expect, it } from "vite-plus/test";

import {
  isNexiWelcomeSetupEnabled,
  isWelcomeLandingPath,
  NEXI_WELCOME_SETUP_FLAG,
} from "./t3team-welcomeGating.logic";

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

describe("isWelcomeLandingPath", () => {
  const on = { nexiWelcome: true, alreadyOpened: false };

  it("opens setup from the landing routes only", () => {
    expect(isWelcomeLandingPath("/", on)).toBe(true);
    expect(isWelcomeLandingPath("/t3team", on)).toBe(true);
    expect(isWelcomeLandingPath("/settings", on)).toBe(false);
    expect(isWelcomeLandingPath("/settings/providers", on)).toBe(false);
    expect(isWelcomeLandingPath("/t3team/projects/p/threads/t", on)).toBe(false);
  });

  it("opens once per session, so coming back from a setup link is not bounced", () => {
    expect(isWelcomeLandingPath("/t3team", { ...on, alreadyOpened: true })).toBe(false);
  });

  it("leaves /t3team alone with the page off", () => {
    expect(isWelcomeLandingPath("/t3team", { nexiWelcome: false, alreadyOpened: false })).toBe(
      false,
    );
    expect(isWelcomeLandingPath("/", { nexiWelcome: false, alreadyOpened: false })).toBe(true);
  });
});
