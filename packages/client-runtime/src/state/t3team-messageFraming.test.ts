import { withT3TeamMessageExtContext } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isHiddenT3TeamFramingMessage, readT3TeamMessageExt } from "./t3team-messageFraming.ts";

describe("isHiddenT3TeamFramingMessage", () => {
  it("hides ext-hidden transport and anonymous system continuations", () => {
    // The widget-action transport: the person clicked, the agent reads the payload.
    expect(
      isHiddenT3TeamFramingMessage({
        createdBy: "user",
        context: withT3TeamMessageExtContext({ visibleToUser: false, displayText: "approve" }),
      }),
    ).toBe(true);
    // The transient-retry "Continue where you left off." (the retry note explains it).
    expect(isHiddenT3TeamFramingMessage({ createdBy: "system" })).toBe(true);
  });

  it("keeps workflow prompts visible: a system-authored message that declares its author", () => {
    const askAgent = withT3TeamMessageExtContext({
      author: {
        kind: "workflow",
        workflowRunId: "run-1",
        stepId: "step-1",
        label: "Review the diff",
      },
    });
    const notifyAgent = withT3TeamMessageExtContext({
      author: { kind: "system", workflowRunId: "run-1", stepId: "step-2" },
    });
    expect(isHiddenT3TeamFramingMessage({ createdBy: "system", context: askAgent })).toBe(false);
    expect(isHiddenT3TeamFramingMessage({ createdBy: "system", context: notifyAgent })).toBe(false);
  });

  it("shows people's and agents' messages, including ones with a visible ext", () => {
    expect(isHiddenT3TeamFramingMessage({ createdBy: "user" })).toBe(false);
    expect(isHiddenT3TeamFramingMessage({ createdBy: "agent" })).toBe(false);
    expect(
      isHiddenT3TeamFramingMessage({
        createdBy: "user",
        context: withT3TeamMessageExtContext({ displayText: "Tell me more" }),
      }),
    ).toBe(false);
    expect(isHiddenT3TeamFramingMessage({})).toBe(false);
  });
});

describe("readT3TeamMessageExt", () => {
  it("decodes a context once and returns nothing for a context without the fork record", () => {
    const context = withT3TeamMessageExtContext({ displayText: "hi" });
    expect(readT3TeamMessageExt(context)).toBe(readT3TeamMessageExt(context));
    expect(readT3TeamMessageExt({ version: 1, records: [] })).toBeUndefined();
    expect(readT3TeamMessageExt(undefined)).toBeUndefined();
  });
});
