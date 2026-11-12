import { describe, expect, it } from "vite-plus/test";

import {
  INITIAL_WELCOME_SKIP,
  welcomeSkipFromKeys,
  welcomeSkipKeysWith,
  withWelcomeSkip,
} from "./t3team-welcomeSkipped";

describe("withWelcomeSkip", () => {
  it("marks a section skipped without mutating the previous state", () => {
    const next = withWelcomeSkip(INITIAL_WELCOME_SKIP, "jira");
    expect(next.jira).toBe(true);
    expect(INITIAL_WELCOME_SKIP.jira).toBe(false);
    expect(withWelcomeSkip(next, "jira")).toBe(next);
  });
});

describe("persisted skips", () => {
  it("restores the skip state from the stored list, and nothing when none is stored", () => {
    expect(welcomeSkipFromKeys(undefined)).toBe(INITIAL_WELCOME_SKIP);
    expect(welcomeSkipFromKeys(["jira", "cloud"])).toEqual({
      ...INITIAL_WELCOME_SKIP,
      jira: true,
      cloud: true,
    });
  });

  it("appends a skip once and leaves an already stored one alone", () => {
    const stored = welcomeSkipKeysWith(undefined, "github");
    expect(stored).toEqual(["github"]);
    expect(welcomeSkipKeysWith(stored, "github")).toBe(stored);
    expect(welcomeSkipKeysWith(stored, "jira")).toEqual(["github", "jira"]);
  });
});
