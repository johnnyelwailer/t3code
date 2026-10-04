/**
 * GHE #410: an `agent()` child's title and live status label are often identical (e.g. "Story
 * step"), and the naive `${title} — ${statusLabel}` join rendered "Story step — Story step".
 */
import { describe, expect, it } from "vite-plus/test";

import { formatActiveAgentLabel } from "~/t3team/chat/t3team-activeAgentsCore";

describe("formatActiveAgentLabel", () => {
  it("drops the redundant status label when it matches the title exactly", () => {
    expect(formatActiveAgentLabel("Story step", "Story step")).toBe("Story step");
  });

  it("drops the redundant status label when it only differs by case", () => {
    expect(formatActiveAgentLabel("Story step", "story step")).toBe("Story step");
  });

  it("drops the redundant status label when it only differs by surrounding whitespace", () => {
    expect(formatActiveAgentLabel("Story step", "  Story step  ")).toBe("Story step");
  });

  it("joins title and status label with an em dash when they differ", () => {
    expect(formatActiveAgentLabel("Story step", "Running")).toBe("Story step — Running");
  });
});
