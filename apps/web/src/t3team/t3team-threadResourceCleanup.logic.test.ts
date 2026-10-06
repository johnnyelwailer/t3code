import type { ResourcePressureCleanupPlan } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cleanupConfirmMessage, cleanupResultTitle } from "./t3team-threadResourceCleanup.logic";

const plan = (overrides: Partial<ResourcePressureCleanupPlan>): ResourcePressureCleanupPlan => ({
  threadId: ThreadId.make("t1"),
  enabled: true,
  targets: [],
  skipped: [],
  agentSession: null,
  ...overrides,
});

describe("thread cleanup confirm", () => {
  it("lists every PID that gets SIGINT and why, the session stop, and what is skipped", () => {
    const message = cleanupConfirmMessage(
      plan({
        targets: [
          {
            pid: 4242,
            startTimeMs: 7,
            jobId: "j1",
            command: "npm run build",
            residentBytes: 300 * 1024 ** 2,
            reason: "background job j1 of this thread's agent session",
          },
        ],
        skipped: [
          { label: "job j2 (sleep 999)", reason: "the runtime reported no PID for this job" },
        ],
        agentSession: { provider: "pi", reason: "this thread's pi agent session — stopped" },
      }),
    );
    expect(message).toBe(
      [
        "Clean up this thread's resources?",
        "",
        "SIGINT (like Ctrl-C) to:",
        "• PID 4242 — background job j1 of this thread's agent session: npm run build (300 MB)",
        "",
        "Stop:",
        "• this thread's pi agent session — stopped",
        "",
        "Not signaled:",
        "• job j2 (sleep 999) — the runtime reported no PID for this job",
        "",
        "Worktrees and files are not touched.",
      ].join("\n"),
    );
  });

  it("asks nothing when there is nothing to stop", () => {
    expect(cleanupConfirmMessage(plan({}))).toBeNull();
  });

  it("titles a partial result honestly", () => {
    const base = { signaled: [1], agentSessionStopped: false, message: "" };
    expect(cleanupResultTitle({ ...base, notSignaled: [] })).toBe("Thread resources cleaned up");
    expect(cleanupResultTitle({ ...base, notSignaled: [{ pid: 2, reason: "gone" }] })).toBe(
      "Cleanup partly done",
    );
  });
});
