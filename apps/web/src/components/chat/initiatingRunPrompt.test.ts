import { ScheduledTaskId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectPromptTriggerMessageIds, initiatingRunPromptText } from "./initiatingRunPrompt";

const prompt = (text: string, extra: Partial<Parameters<typeof initiatingRunPromptText>[0]> = {}) =>
  initiatingRunPromptText({ role: "user", text, ...extra });

describe("initiatingRunPromptText", () => {
  it("copies a user message exactly as stored", () => {
    expect(prompt("  Ship the fix\n")).toBe("  Ship the fix\n");
    expect(
      prompt("Review this", {
        role: "user",
        text: "Review this",
        createdBy: "user",
        creationSource: "web",
      }),
    ).toBe("Review this");
  });

  it("copies an agent-delegated brief, a scheduled prompt, and an inter-agent message", () => {
    expect(
      prompt("Fix the auth regression", {
        role: "user",
        text: "Fix the auth regression",
        createdBy: "agent",
        creationSource: "mcp",
      }),
    ).toBe("Fix the auth regression");
    expect(
      prompt("[Triggered by schedule task: Nightly]\n\nSummarize the inbox", {
        role: "user",
        text: "[Triggered by schedule task: Nightly]\n\nSummarize the inbox",
        createdBy: "agent",
        creationSource: "server",
        scheduledTaskId: ScheduledTaskId.make("task-nightly"),
      }),
    ).toBe("[Triggered by schedule task: Nightly]\n\nSummarize the inbox");
    expect(
      prompt("Please review the diff", {
        role: "user",
        text: "Please review the diff",
        createdBy: "agent",
        creationSource: "mcp",
        senderThreadId: ThreadId.make("thread-sender"),
      }),
    ).toBe("Please review the diff");
  });

  it("copies a workflow prompt and keeps display text out of the clipboard string", () => {
    expect(
      prompt("Read the work item, then rewrite the description.", {
        role: "user",
        text: "Read the work item, then rewrite the description.",
        createdBy: "system",
        creationSource: "server",
        t3teamExt: {
          author: {
            kind: "workflow",
            workflowRunId: "run-1",
            stepId: "step-1",
            label: "Rewrite the description",
          },
          displayText: "Rewrite the description",
        },
      }),
    ).toBe("Read the work item, then rewrite the description.");
  });

  it("hides the control when no initiating text is stored", () => {
    expect(prompt("")).toBeNull();
    expect(prompt("   ")).toBeNull();
    expect(prompt("Done", { role: "assistant", text: "Done" })).toBeNull();
    expect(
      prompt("Continue where you left off.", {
        role: "user",
        text: "Continue where you left off.",
        createdBy: "agent",
        creationSource: "server",
      }),
    ).toBeNull();
    expect(
      prompt("Continue where you left off.", {
        role: "user",
        text: "Continue where you left off.",
        createdBy: "user",
        creationSource: "server",
      }),
    ).toBeNull();
    expect(
      prompt("Continue where you left off.", {
        role: "user",
        text: "Continue where you left off.",
        createdBy: "system",
      }),
    ).toBeNull();
    expect(
      prompt("Background task completed.", {
        role: "user",
        text: "Background task completed.",
        createdBy: "agent",
        creationSource: "provider",
        promptTrigger: true,
      }),
    ).toBeNull();
    expect(
      prompt("Hidden transport", {
        role: "user",
        text: "Hidden transport",
        t3teamExt: { visibleToUser: false },
      }),
    ).toBeNull();
  });
});

describe("collectPromptTriggerMessageIds", () => {
  it("marks wakes that are not a scheduled prompt or an inter-agent message", () => {
    expect(
      collectPromptTriggerMessageIds([
        { id: "wake", notification: { source: { kind: "background_task" } } },
        { id: "delegated", delegatedCompletion: { parentRunId: "run-1" } },
        {
          id: "digest",
          notification: { source: { kind: "background_task" } },
          senderThreadId: "thread-a",
        },
        {
          id: "nightly",
          notification: { source: { kind: "background_task" } },
          scheduledTaskId: "task-1",
        },
        { id: "person" },
      ]),
    ).toEqual(new Set(["wake", "delegated"]));
  });
});
