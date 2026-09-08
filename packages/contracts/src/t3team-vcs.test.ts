import { describe, expect, it } from "vite-plus/test";

import { VcsProcessExitError, truncateVcsProcessStderr, VCS_PROCESS_STDERR_CAP } from "./vcs.ts";

const context = {
  operation: "test.operation",
  command: "gh",
  cwd: "/repo",
};

describe("VcsProcessExitError", () => {
  it("carries the truncated stderr so failures are diagnosable", () => {
    const error = VcsProcessExitError.fromProcessExit(
      context,
      {
        exitCode: 128,
        stderr: "fatal: short read while indexing nul\n",
        originalStderrLength: 35,
        stderrTruncated: false,
      },
      "command-failed",
    );
    expect(error.stderr).toBe("fatal: short read while indexing nul");
    expect(error.message).toContain("stderr: fatal: short read while indexing nul");
    expect(error.stderrLength).toBe(35);
    expect(error.stderrTruncated).toBe(false);
  });

  it("truncates oversized stderr at the cap and flags it", () => {
    const huge = "x".repeat(VCS_PROCESS_STDERR_CAP + 500);
    const error = VcsProcessExitError.fromProcessExit(
      context,
      { exitCode: 1, stderr: huge, originalStderrLength: huge.length, stderrTruncated: false },
      "command-failed",
    );
    expect(error.stderr?.length).toBeLessThanOrEqual(VCS_PROCESS_STDERR_CAP + 1);
    expect(error.stderr?.endsWith("…")).toBe(true);
    expect(error.stderrLength).toBe(huge.length);
    expect(error.stderrTruncated).toBe(true);
  });

  it("omits stderr when the process produced none", () => {
    const error = VcsProcessExitError.fromProcessExit(
      context,
      { exitCode: 1, stderr: "  \n ", originalStderrLength: 5, stderrTruncated: false },
      "command-failed",
    );
    expect(error.stderr).toBeUndefined();
    expect(error.message).not.toContain("stderr:");
  });
});

describe("truncateVcsProcessStderr", () => {
  it("passes short stderr through unchanged", () => {
    expect(truncateVcsProcessStderr("ok")).toBe("ok");
    expect(truncateVcsProcessStderr("a".repeat(VCS_PROCESS_STDERR_CAP))).toBe(
      "a".repeat(VCS_PROCESS_STDERR_CAP),
    );
  });

  it("caps long stderr", () => {
    const result = truncateVcsProcessStderr("a".repeat(VCS_PROCESS_STDERR_CAP + 10));
    expect(result).toBe(`${"a".repeat(VCS_PROCESS_STDERR_CAP)}…`);
  });
});
