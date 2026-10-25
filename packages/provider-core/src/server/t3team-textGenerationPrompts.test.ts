import { describe, expect, it } from "vite-plus/test";

import { buildActivityLabelPrompt, buildThreadTitlePrompt } from "./textGenerationPrompts.ts";
import { sanitizeActivityLabel } from "./textGenerationUtils.ts";

describe("buildThreadTitlePrompt regeneration", () => {
  it("regenerates from recent agent-side contents and identifies the previous title", () => {
    const result = buildThreadTitlePrompt({
      message: `ASSISTANT:\nThe remaining issue is stale session state`,
      previousTitle: "Investigate reconnect regressions",
    });

    expect(result.prompt).toContain(
      "Regenerate the title for an existing T3 Code thread so the user can recognize it weeks later.",
    );
    expect(result.prompt).toContain('The previous title was "Investigate reconnect regressions".');
    // GHE #308: the regeneration prompt is driven by agent activity, never user prose.
    expect(result.prompt).toContain(
      "User messages are intentionally omitted: the title must name the work the agent is doing,",
    );
    expect(result.prompt).toContain(
      "Read the ASSISTANT messages and name the work the thread is doing:",
    );
    expect(result.prompt).not.toContain("Read the USER messages first");
    expect(result.prompt).toContain("Agent messages:");
    expect(result.prompt).toContain("The remaining issue is stale session state");
  });
});

describe("buildActivityLabelPrompt", () => {
  it("hard-caps the context at 400 chars even when the caller forgot its own cap", () => {
    const huge = `${"x".repeat(5_000)}`;
    const { prompt } = buildActivityLabelPrompt({ context: huge });
    // The instruction plus the capped context + truncation marker — never the 5k payload.
    expect(prompt).toContain("[truncated]");
    expect(prompt.length).toBeLessThan(2_000);
    expect(prompt).toContain("2-4 word phrase");
    expect(prompt).toContain("label");
  });

  it("carries the recent-activity context into the prompt", () => {
    const { prompt, outputSchema } = buildActivityLabelPrompt({
      context: "User intent: fix the build\n- tool.started: npm run build",
    });
    expect(prompt).toContain("User intent: fix the build");
    expect(prompt).toContain("- tool.started: npm run build");
    expect(outputSchema).toBeDefined();
  });
});

describe("sanitizeActivityLabel", () => {
  it("normalizes quotes, periods and repeated whitespace", () => {
    expect(sanitizeActivityLabel('"Reading contracts."')).toBe("Reading contracts");
    expect(sanitizeActivityLabel("  Running   tests  ")).toBe("Running tests");
  });

  it("returns empty for unusable output", () => {
    expect(sanitizeActivityLabel("")).toBe("");
    expect(sanitizeActivityLabel("   ")).toBe("");
  });
});
