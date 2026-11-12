import { describe, expect, it } from "vite-plus/test";

import {
  hasSeenCurrentWelcome,
  isNexiWelcomeSetupEnabled,
  isWelcomeLandingPath,
  NEXI_WELCOME_SEEN_VERSION,
  NEXI_WELCOME_SETUP_FLAG,
  resolveNexiWelcomeFirstRunDecision,
  withWelcomeSeenVersion,
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

  it("lets Settings reopen /welcome after the current generation is seen", () => {
    expect(hasSeenCurrentWelcome(NEXI_WELCOME_SEEN_VERSION)).toBe(true);
    expect(isWelcomeLandingPath("/welcome", { ...on, alreadyOpened: true })).toBe(false);
    expect(isWelcomeLandingPath("/settings", { ...on, alreadyOpened: true })).toBe(false);
  });
});

describe("resolveNexiWelcomeFirstRunDecision", () => {
  it("shows the setup once on a fresh install, and not after it is marked seen", () => {
    expect(
      resolveNexiWelcomeFirstRunDecision({ hydrated: true, seenVersion: undefined }),
    ).toEqual({ decision: "wizard", persistCompletion: false });
    expect(
      resolveNexiWelcomeFirstRunDecision({
        hydrated: true,
        seenVersion: NEXI_WELCOME_SEEN_VERSION,
      }),
    ).toEqual({ decision: "app", persistCompletion: false });
  });

  it("shows the setup once for an upgrade with old data, and not on the second launch", () => {
    // Old data that used to suppress first-run: a completed onboarding, existing
    // projects, and section skips. The decision does not take those, so they cannot hide it.
    const firstLaunch = resolveNexiWelcomeFirstRunDecision({
      hydrated: true,
      seenVersion: undefined,
    });
    expect(firstLaunch).toEqual({ decision: "wizard", persistCompletion: false });

    const afterFinish = withWelcomeSeenVersion({
      welcomeSkipped: ["account", "jira"] as const,
      welcomeSeenVersion: undefined,
      storedProjectsJson: "[{}]",
    });
    expect(afterFinish.welcomeSeenVersion).toBe(NEXI_WELCOME_SEEN_VERSION);
    expect(afterFinish.welcomeSkipped).toEqual(["account", "jira"]);
    expect(afterFinish.storedProjectsJson).toBe("[{}]");
    expect(
      resolveNexiWelcomeFirstRunDecision({
        hydrated: true,
        seenVersion: afterFinish.welcomeSeenVersion,
      }),
    ).toEqual({ decision: "app", persistCompletion: false });
  });

  it("shows the setup again when the stored generation is older than the current one", () => {
    expect(hasSeenCurrentWelcome(0)).toBe(false);
    expect(
      resolveNexiWelcomeFirstRunDecision({ hydrated: true, seenVersion: 0 }),
    ).toEqual({ decision: "wizard", persistCompletion: false });
  });

  it("waits for settings hydration before deciding", () => {
    expect(
      resolveNexiWelcomeFirstRunDecision({ hydrated: false, seenVersion: undefined }),
    ).toEqual({ decision: "pending", persistCompletion: false });
    expect(
      resolveNexiWelcomeFirstRunDecision({
        hydrated: false,
        seenVersion: NEXI_WELCOME_SEEN_VERSION,
      }),
    ).toEqual({ decision: "pending", persistCompletion: false });
  });
});

describe("withWelcomeSeenVersion", () => {
  it("is a no-op when the current generation is already recorded", () => {
    const current = { welcomeSeenVersion: NEXI_WELCOME_SEEN_VERSION, welcomeSkipped: ["cloud"] };
    expect(withWelcomeSeenVersion(current)).toBe(current);
  });
});
