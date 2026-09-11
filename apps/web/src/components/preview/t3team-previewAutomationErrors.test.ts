import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  PreviewAutomationHostTargetLostError,
  PreviewAutomationOperationError,
  previewAutomationTargetLostReason,
} from "./previewAutomationErrors.ts";

const context = {
  requestId: "req-1",
  operation: "evaluate" as const,
  environmentId: "env-1" as never,
  threadId: "thread-1" as never,
  tabId: "tab-c" as never,
};

const abortedInNode = new DOMException("This operation was aborted", "AbortError");
const abortedInChromium = (() => {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
})();
const targetClosed = new Error("Target closed");
const contextClosed = new Error("Target page, context or browser has been closed");

describe("previewAutomationTargetLostReason", () => {
  it("classifies DOMException aborts from both engines as aborted", () => {
    expect(previewAutomationTargetLostReason(abortedInNode)).toBe("aborted");
    expect(previewAutomationTargetLostReason(abortedInChromium)).toBe("aborted");
  });

  it("classifies CDP target/context deaths as target-closed", () => {
    expect(previewAutomationTargetLostReason(targetClosed)).toBe("target-closed");
    expect(previewAutomationTargetLostReason(contextClosed)).toBe("target-closed");
  });

  it("leaves other failures unclassified", () => {
    expect(previewAutomationTargetLostReason(new TypeError("undefined is not a function"))).toBe(
      null,
    );
    expect(previewAutomationTargetLostReason("Target closed")).toBe(null);
    expect(previewAutomationTargetLostReason(undefined)).toBe(null);
  });
});

describe("PreviewAutomationOperationError.fromCause target-lost mapping", () => {
  it("maps abort causes to the typed target-lost error", () => {
    const mapped = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: abortedInNode,
    });
    expect(mapped.responseTag).toBe("PreviewAutomationTargetLostError");
    expect(mapped.message).toContain("rebind the preview tab");
    expect(Schema.is(PreviewAutomationHostTargetLostError)(mapped)).toBe(true);
  });

  it("maps target-closed causes to the typed target-lost error", () => {
    const mapped = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: targetClosed,
    });
    expect(mapped.responseTag).toBe("PreviewAutomationTargetLostError");
    expect(mapped.message).toContain("was closed");
  });

  it("keeps generic failures as the generic operation error", () => {
    const mapped = PreviewAutomationOperationError.fromCause({
      ...context,
      cause: new TypeError("boom"),
    });
    expect(mapped.responseTag).toBe("PreviewAutomationExecutionError");
    expect(Schema.is(PreviewAutomationOperationError)(mapped)).toBe(true);
  });
});
