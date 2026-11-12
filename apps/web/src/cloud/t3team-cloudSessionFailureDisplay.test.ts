import { describe, expect, it } from "vite-plus/test";

import { displayCloudQueuedFailureMessage } from "./t3team-cloudSessionFailureDisplay";

const LEGACY_683 =
  "Your message is kept: retry, send it in the machine's own project, start a plain session, or cancel to edit it.";

describe("displayCloudQueuedFailureMessage", () => {
  it("leaves wording alone when it does not mention a plain session", () => {
    const msg = "The cloud machine hasn't opened the project yet. Your message is saved.";
    expect(displayCloudQueuedFailureMessage(msg, [])).toBe(msg);
  });

  it("keeps the promise when Start a plain session is actually on offer", () => {
    expect(
      displayCloudQueuedFailureMessage(LEGACY_683, [{ id: "plain-session" }]),
    ).toBe(LEGACY_683);
  });

  it("strips the stale 08:27 promise when that action is not on offer", () => {
    const shown = displayCloudQueuedFailureMessage(LEGACY_683, [
      { id: "machine-project" },
    ]);
    expect(shown.toLowerCase()).not.toContain("start a plain session");
    expect(shown).toContain("Your message is kept");
    expect(shown).toContain("retry");
    expect(shown).toContain("machine's own project");
    expect(shown).toContain("cancel to edit it");
  });
});
