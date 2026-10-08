import { ScheduledTaskId, ThreadId, withT3TeamMessageExtContext } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveRunInitiatingPrompt } from "./t3team-runPromptCopy.ts";

const prompt = (
  text: string,
  extra: Partial<Parameters<typeof resolveRunInitiatingPrompt>[0]> = {},
) => resolveRunInitiatingPrompt({ role: "user", text, ...extra });

describe("resolveRunInitiatingPrompt", () => {
  it("copies a person's message exactly, including an unsent optimistic row", () => {
    expect(prompt("Fix the leak\n")).toBe("Fix the leak\n");
    expect(prompt("Fix the leak", { createdBy: "user", creationSource: "web" })).toBe(
      "Fix the leak",
    );
    expect(prompt("Fix the leak", { createdBy: "user", creationSource: "mobile" })).toBe(
      "Fix the leak",
    );
  });

  it("copies the stored words instead of the provider prompt", () => {
    const providerRequest = "Please fix it\n\nWork item: AUTH-4\nfull dump";
    expect(
      prompt(providerRequest, {
        createdBy: "user",
        creationSource: "web",
        t3teamExt: { displayText: "Please fix it" },
      }),
    ).toBe("Please fix it");
    expect(
      prompt(providerRequest, {
        createdBy: "user",
        creationSource: "web",
        context: withT3TeamMessageExtContext({ displayText: "Please fix it" }),
      }),
    ).toBe("Please fix it");
  });

  it("copies a delegated brief and an inter-agent message as stored", () => {
    const senderThreadId = ThreadId.make("thread-parent");
    expect(
      prompt("Review the auth path", {
        createdBy: "agent",
        creationSource: "mcp",
        senderThreadId,
      }),
    ).toBe("Review the auth path");
    const digest = "[Inter-agent digest: 1 message(s)]\n\nCheck the migration.";
    expect(
      prompt(digest, {
        createdBy: "agent",
        creationSource: "server",
        senderThreadId,
      }),
    ).toBe(digest);
  });

  it("copies a scheduled prompt, dropping only a legacy attribution prefix", () => {
    const scheduled = "Check for crashes.\n";
    expect(
      prompt(scheduled, {
        createdBy: "user",
        creationSource: "web",
        scheduledTaskId: ScheduledTaskId.make("task-1"),
      }),
    ).toBe(scheduled);
    const legacy = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";
    expect(prompt(legacy, { createdBy: "agent" })).toBe("Check for crashes.\n");
  });

  it("copies a workflow prompt that names its author", () => {
    expect(
      prompt("Ask the agent to review the diff", {
        createdBy: "system",
        creationSource: "server",
        t3teamExt: {
          author: {
            kind: "workflow",
            workflowRunId: "run-1",
            stepId: "step-1",
            label: "Review",
          },
        },
      }),
    ).toBe("Ask the agent to review the diff");
  });

  it("hides system triggers, tool continuations, and empty prompts", () => {
    expect(prompt("Continue where you left off.", { createdBy: "system" })).toBeNull();
    expect(
      prompt("Continue where you left off.", { createdBy: "user", creationSource: "server" }),
    ).toBeNull();
    expect(
      prompt("Continue where you left off.", { createdBy: "agent", creationSource: "server" }),
    ).toBeNull();
    expect(
      prompt("Background task completed.", { createdBy: "agent", creationSource: "provider" }),
    ).toBeNull();
    expect(
      prompt("Delegated task task-1 reached a terminal state.", {
        createdBy: "agent",
        creationSource: "server",
      }),
    ).toBeNull();
    expect(prompt("   ", { createdBy: "user", creationSource: "web" })).toBeNull();
    expect(prompt("hidden", { role: "assistant", createdBy: "user" })).toBeNull();
    expect(
      prompt("approve", {
        createdBy: "user",
        creationSource: "web",
        t3teamExt: { visibleToUser: false, displayText: "approve" },
      }),
    ).toBeNull();
  });
});
