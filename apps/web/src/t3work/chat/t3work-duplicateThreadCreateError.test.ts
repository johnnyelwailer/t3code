import { describe, expect, it } from "vite-plus/test";

import { isDuplicateThreadCreateError } from "~/t3work/chat/t3work-duplicateThreadCreateError";

const DUPLICATE_MESSAGE =
  "Orchestration command invariant failed (thread.create): Thread 'thread-1784921554807-1' already exists and cannot be created twice.";

describe("isDuplicateThreadCreateError", () => {
  it("matches a plain Error", () => {
    expect(isDuplicateThreadCreateError(new Error(DUPLICATE_MESSAGE))).toBe(true);
  });

  it("matches a bare string", () => {
    expect(isDuplicateThreadCreateError(DUPLICATE_MESSAGE)).toBe(true);
  });

  it("matches the Effect Cause envelope the atom-command layer rejects with", () => {
    expect(
      isDuplicateThreadCreateError({
        _id: "Cause",
        failures: [
          {
            _tag: "Fail",
            error: { _tag: "OrchestrationDispatchCommandError", message: DUPLICATE_MESSAGE },
          },
        ],
      }),
    ).toBe(true);
  });

  it("matches a nested cause chain", () => {
    expect(
      isDuplicateThreadCreateError({
        _tag: "Die",
        cause: { error: new Error(DUPLICATE_MESSAGE) },
      }),
    ).toBe(true);
  });

  it("does not match unrelated failures", () => {
    expect(isDuplicateThreadCreateError(new Error("Thread not found"))).toBe(false);
    expect(
      isDuplicateThreadCreateError({
        _id: "Cause",
        failures: [{ _tag: "Fail", error: { _tag: "SomeOtherError", message: "boom" } }],
      }),
    ).toBe(false);
    expect(isDuplicateThreadCreateError(undefined)).toBe(false);
    expect(isDuplicateThreadCreateError(null)).toBe(false);
  });
});
