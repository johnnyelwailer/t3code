import type {
  OrchestrationV2ProviderFailure,
  OrchestrationV2Run,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { isManuallyContinuableRun } from "./t3team-manualContinuation.ts";

const now = DateTime.makeUnsafe("2026-10-08T10:00:00.000Z");

const run = (status: OrchestrationV2Run["status"]) =>
  ({ id: "run-1", rootNodeId: "node-1", status }) as unknown as OrchestrationV2Run;

const failedWith = (failure: OrchestrationV2ProviderFailure) =>
  [
    {
      id: "error-1",
      type: "error",
      status: "failed",
      runId: "run-1",
      nodeId: "node-1",
      ordinal: 1,
      updatedAt: now,
      failure,
    },
  ] as unknown as ReadonlyArray<OrchestrationV2TurnItem>;

const failure = (
  overrides: Partial<OrchestrationV2ProviderFailure>,
): OrchestrationV2ProviderFailure => ({
  class: "provider_error",
  message: "The model returned an error",
  code: null,
  retryable: null,
  ...overrides,
});

describe("isManuallyContinuableRun", () => {
  it.each([
    ["ordinary provider error", failure({})],
    ["unknown failure", failure({ class: "unknown" })],
    ["permission error", failure({ class: "permission_error", message: "401 unauthorized" })],
    ["validation error", failure({ class: "validation_error" })],
    ["usage limit", failure({ class: "usage_limit" })],
    ["transient transport error", failure({ class: "transport_error", retryable: true })],
  ])("continues a run that failed with a %s", (_name, value) => {
    expect(isManuallyContinuableRun(run("failed"), failedWith(value))).toBe(true);
  });

  it("continues a failed run with no recorded failure, and an interrupted run", () => {
    expect(isManuallyContinuableRun(run("failed"), [])).toBe(true);
    expect(isManuallyContinuableRun(run("interrupted"), [])).toBe(true);
  });

  it("never continues an older run that recorded an unacknowledged Stop as failed", () => {
    const stop = failure({ class: "transport_error", code: "interrupt_no_terminal" });
    expect(isManuallyContinuableRun(run("failed"), failedWith(stop))).toBe(false);
  });

  it("keeps an unacknowledged Stop settled as interrupted resumable, like any interrupted run", () => {
    expect(isManuallyContinuableRun(run("interrupted"), [])).toBe(true);
  });

  it.each(["cancelled", "completed", "running", "queued", "waiting", "rolled_back"] as const)(
    "never continues a %s run",
    (status) => {
      expect(isManuallyContinuableRun(run(status), [])).toBe(false);
    },
  );

  it("has nothing to continue without a run", () => {
    expect(isManuallyContinuableRun(null, [])).toBe(false);
  });
});
