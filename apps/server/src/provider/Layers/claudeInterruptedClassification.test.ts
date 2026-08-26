import { describe, expect, it } from "vite-plus/test";

import { isClaudeInterruptedMessage } from "./ClaudeAdapter.ts";

describe("isClaudeInterruptedMessage", () => {
  it("recognizes the established interruption phrasings", () => {
    expect(isClaudeInterruptedMessage("All fibers interrupted without error")).toBe(true);
    expect(isClaudeInterruptedMessage("Request was aborted")).toBe(true);
    expect(isClaudeInterruptedMessage("Interrupted by user")).toBe(true);
  });

  it("treats DOMException AbortError phrasing as an interruption, not a fault", () => {
    // undici/fetch layer DOMException message ("This operation was aborted")
    // surfaces when a mid-tool-call abort kills the provider stream; it must
    // classify as interrupted so the turn is non-terminal.
    expect(isClaudeInterruptedMessage("This operation was aborted")).toBe(true);
    expect(isClaudeInterruptedMessage("this operation was aborted")).toBe(true);
  });

  it("leaves real provider faults unclassified", () => {
    expect(isClaudeInterruptedMessage("upstream connect error")).toBe(false);
    expect(
      isClaudeInterruptedMessage('Request failed with status 423: {"type":"reservation_error"}'),
    ).toBe(false);
  });
});
