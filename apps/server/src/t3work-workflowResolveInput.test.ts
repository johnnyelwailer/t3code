/**
 * Resolve-input value checks (Epic 25 §askUser decision cards): a structured value must fit the
 * pending ask's affordance and the card's correlationId must still be the pending one; freeform
 * text (no value) is never blocked. Display text falls back from the provided text to the value.
 */

import { describe, expect, it } from "vite-plus/test";

import type { WorkflowPendingAsk } from "./t3work-workflowEngineRegistry.ts";
import {
  rejectWorkflowResolveValue,
  workflowReplyDisplayText,
} from "./t3work-workflowResolveInput.ts";

const choicePending: WorkflowPendingAsk = {
  runId: "run-1",
  correlationId: "run-1:1",
  kind: "user.input",
  affordance: { kind: "choice", options: ["ship-now", "hold"] },
};

const fieldedPending: WorkflowPendingAsk = {
  runId: "run-1",
  correlationId: "run-1:1",
  kind: "user.input",
  affordance: { kind: "choice", field: "severity", options: ["low", "high"] },
};

const booleanPending: WorkflowPendingAsk = {
  runId: "run-1",
  correlationId: "run-1:1",
  kind: "user.input",
  affordance: { kind: "boolean", labels: { true: "Ship it", false: "Hold" } },
};

const formPending: WorkflowPendingAsk = {
  runId: "run-1",
  correlationId: "run-1:1",
  kind: "user.input",
  affordance: {
    kind: "form",
    fields: [
      { name: "severity", type: "literals", options: ["low", "high"], optional: false },
      { name: "note", type: "string", optional: false },
      { name: "urgent", type: "boolean", optional: false },
      { name: "owner", type: "string", optional: true },
    ],
  },
};

describe("rejectWorkflowResolveValue", () => {
  it("accepts an offered choice", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: choicePending,
        correlationId: "run-1:1",
        hasValue: true,
        value: "hold",
      }),
    ).toBeNull();
  });

  it("rejects a value outside the offered choices", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: choicePending,
        correlationId: undefined,
        hasValue: true,
        value: "merge-later",
      }),
    ).toMatch(/does not match the offered choices/);
  });

  it("accepts a fielded choice submitted as { field: option } and rejects other shapes", () => {
    const base = { pending: fieldedPending, correlationId: undefined, hasValue: true };
    expect(rejectWorkflowResolveValue({ ...base, value: { severity: "high" } })).toBeNull();
    expect(rejectWorkflowResolveValue({ ...base, value: "high" })).not.toBeNull();
    expect(
      rejectWorkflowResolveValue({ ...base, value: { severity: "high", extra: 1 } }),
    ).not.toBeNull();
    expect(rejectWorkflowResolveValue({ ...base, value: { severity: "medium" } })).not.toBeNull();
  });

  it("accepts a boolean for a boolean ask and rejects anything else", () => {
    const base = { pending: booleanPending, correlationId: undefined, hasValue: true };
    expect(rejectWorkflowResolveValue({ ...base, value: true })).toBeNull();
    expect(rejectWorkflowResolveValue({ ...base, value: false })).toBeNull();
    expect(rejectWorkflowResolveValue({ ...base, value: "Ship it" })).toMatch(/yes or no/);
    expect(rejectWorkflowResolveValue({ ...base, value: 1 })).toMatch(/yes or no/);
  });

  it("accepts a well-typed form submission (optional field may be omitted)", () => {
    const base = { pending: formPending, correlationId: undefined, hasValue: true };
    expect(
      rejectWorkflowResolveValue({
        ...base,
        value: { severity: "high", note: "rounding bug", urgent: true },
      }),
    ).toBeNull();
    expect(
      rejectWorkflowResolveValue({
        ...base,
        value: { severity: "low", note: "x", urgent: false, owner: "pj" },
      }),
    ).toBeNull();
  });

  it("rejects a form submission with a missing required field, bad type, or out-of-range literal", () => {
    const base = { pending: formPending, correlationId: undefined, hasValue: true };
    expect(rejectWorkflowResolveValue({ ...base, value: { severity: "high", note: "x" } })).toMatch(
      /Missing required field "urgent"/,
    );
    expect(
      rejectWorkflowResolveValue({ ...base, value: { severity: "high", note: 7, urgent: true } }),
    ).toMatch(/Field "note" must be text/);
    expect(
      rejectWorkflowResolveValue({
        ...base,
        value: { severity: "mid", note: "x", urgent: true },
      }),
    ).toMatch(/Field "severity" must be one of/);
    expect(rejectWorkflowResolveValue({ ...base, value: "not-an-object" })).toMatch(
      /expects a form submission/,
    );
  });

  it("rejects a stale correlationId (the card's ask is no longer pending)", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: choicePending,
        correlationId: "run-1:7",
        hasValue: true,
        value: "hold",
      }),
    ).toMatch(/no longer pending/);
    expect(
      rejectWorkflowResolveValue({
        pending: undefined,
        correlationId: "run-1:1",
        hasValue: true,
        value: "hold",
      }),
    ).toMatch(/no longer pending/);
  });

  it("rejects a structured value when no user input is pending", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: undefined,
        correlationId: undefined,
        hasValue: true,
        value: "hold",
      }),
    ).toMatch(/No workflow input is pending/);
    expect(
      rejectWorkflowResolveValue({
        pending: { runId: "run-1", correlationId: "run-1:2", kind: "thread.turn" },
        correlationId: undefined,
        hasValue: true,
        value: "hold",
      }),
    ).toMatch(/No workflow input is pending/);
  });

  it("passes a structured value through when the affordance is unknown (post-restart; SDK validates on resume)", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: { runId: "run-1", correlationId: "run-1:1", kind: "user.input" },
        correlationId: undefined,
        hasValue: true,
        value: { anything: true },
      }),
    ).toBeNull();
  });

  it("rejects a structured value on a known text ask (no schemaless body should see a non-string)", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: {
          runId: "run-1",
          correlationId: "run-1:1",
          kind: "user.input",
          affordance: { kind: "text" },
        },
        correlationId: undefined,
        hasValue: true,
        value: { foo: "bar" },
      }),
    ).toMatch(/freeform text reply/);
  });

  it("never blocks a freeform text reply (no value posted)", () => {
    expect(
      rejectWorkflowResolveValue({
        pending: choicePending,
        correlationId: undefined,
        hasValue: false,
        value: undefined,
      }),
    ).toBeNull();
    expect(
      rejectWorkflowResolveValue({
        pending: undefined,
        correlationId: undefined,
        hasValue: false,
        value: undefined,
      }),
    ).toBeNull();
  });
});

describe("workflowReplyDisplayText", () => {
  it("prefers the provided text, then a string value, then JSON", () => {
    expect(workflowReplyDisplayText("hold", "Hold for now")).toBe("Hold for now");
    expect(workflowReplyDisplayText("hold", "")).toBe("hold");
    expect(workflowReplyDisplayText({ severity: "high" }, "")).toBe('{"severity":"high"}');
  });
});
