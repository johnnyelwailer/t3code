import { describe, expect, it } from "vite-plus/test";

import { threadJobsValidationError } from "./t3team-thread-jobs-route.ts";

describe("thread jobs route validation", () => {
  it("rejects a missing or blank threadId", () => {
    expect(
      threadJobsValidationError({ request: { kind: "list" } }),
    ).toContain("threadId");
    expect(
      threadJobsValidationError({ threadId: "   ", request: { kind: "list" } }),
    ).toContain("threadId");
    expect(
      threadJobsValidationError({ threadId: 42, request: { kind: "list" } }),
    ).toContain("threadId");
  });

  it("rejects a request without a known kind", () => {
    for (const request of [undefined, null, {}, { kind: "stop" }, { kind: "LIST" }]) {
      expect(threadJobsValidationError({ threadId: "thread-1", request })).toContain(
        "kind list|cancel|read-output",
      );
    }
  });

  it("accepts list without a jobId", () => {
    expect(threadJobsValidationError({ threadId: "thread-1", request: { kind: "list" } })).toBeNull();
  });

  it("requires a non-empty jobId for cancel and read-output", () => {
    for (const kind of ["cancel", "read-output"] as const) {
      expect(threadJobsValidationError({ threadId: "thread-1", request: { kind } })).toContain(
        "jobId",
      );
      expect(
        threadJobsValidationError({ threadId: "thread-1", request: { kind, jobId: "" } }),
      ).toContain("jobId");
      expect(
        threadJobsValidationError({ threadId: "thread-1", request: { kind, jobId: 7 } }),
      ).toContain("jobId");
      expect(
        threadJobsValidationError({
          threadId: "thread-1",
          request: { kind, jobId: "job_8865dcbe" },
        }),
      ).toBeNull();
    }
  });

  it("lets extra fields on read-output through (since / maxBytes are optional)", () => {
    expect(
      threadJobsValidationError({
        threadId: "thread-1",
        request: { kind: "read-output", jobId: "job_8865dcbe", since: 12, maxBytes: 3 },
      }),
    ).toBeNull();
  });
});
