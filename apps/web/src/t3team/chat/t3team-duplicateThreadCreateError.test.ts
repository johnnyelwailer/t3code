import { describe, expect, it } from "vite-plus/test";

import {
  isDuplicateProjectBindingError,
  isDuplicateThreadCreateError,
} from "~/t3team/chat/t3team-duplicateThreadCreateError";

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

describe("isDuplicateProjectBindingError", () => {
  it("matches a claimed work-source binding invariant", () => {
    expect(
      isDuplicateProjectBindingError(
        new Error("Work source 'atlassian:acc-1/10001' is already bound to project 'proj-2'."),
      ),
    ).toBe(true);
  });

  it("matches an already-claimed workspace root invariant", () => {
    expect(
      isDuplicateProjectBindingError(
        new Error("Active project 'proj-2' already exists for workspace root '/tmp/alpha'."),
      ),
    ).toBe(true);
  });

  it("does not match a duplicate thread.create invariant or unrelated errors", () => {
    expect(
      isDuplicateProjectBindingError(
        new Error("Thread 'thread-1' already exists and cannot be created twice."),
      ),
    ).toBe(false);
    expect(isDuplicateProjectBindingError(new Error("Project not found"))).toBe(false);
    expect(isDuplicateProjectBindingError(undefined)).toBe(false);
  });
});
