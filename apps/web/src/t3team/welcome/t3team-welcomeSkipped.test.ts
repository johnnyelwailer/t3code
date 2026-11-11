import { describe, expect, it } from "vite-plus/test";

import { INITIAL_WELCOME_SKIP, withWelcomeSkip } from "./t3team-welcomeSkipped";

describe("withWelcomeSkip", () => {
  it("marks a section skipped without mutating the previous state", () => {
    const next = withWelcomeSkip(INITIAL_WELCOME_SKIP, "jira");
    expect(next.jira).toBe(true);
    expect(INITIAL_WELCOME_SKIP.jira).toBe(false);
    expect(withWelcomeSkip(next, "jira")).toBe(next);
  });
});
