/**
 * The rule this locks: an ALREADY-ANSWERED question is never "no longer available".
 *
 * Regression seen live on 2026-08-29 — a `qa-ask-forms` run with three asks was answered through
 * to completion, and the moment the run reached `completed` all three settled cards replaced their
 * choice chips with "This question is no longer available because the orchestration has ended."
 * That is every card in every run that finishes normally, so the settled-card state was effectively
 * unreachable in the end state a user actually scrolls back to.
 */
import { describe, expect, it } from "vitest";

import { workflowDecisionUnavailableMessage } from "~/t3team/chat/t3team-workflowDecisionAvailability";

const DECISION = {
  question: "Ship it?",
  affordance: { kind: "choice", options: ["ship", "hold"] },
  correlationId: "run-1:1",
  workflowRunId: "run-1",
} as unknown as Parameters<typeof workflowDecisionUnavailableMessage>[0];

const runStatus = (status: string) =>
  ({ runId: "run-1", status }) as unknown as Parameters<
    typeof workflowDecisionUnavailableMessage
  >[1];

const progress = (phase: string) =>
  ({ run: { phase } }) as unknown as Parameters<typeof workflowDecisionUnavailableMessage>[2];

describe("workflowDecisionUnavailableMessage", () => {
  it("retires an UNANSWERED question once its run reaches a terminal status", () => {
    expect(
      workflowDecisionUnavailableMessage(DECISION, runStatus("completed"), undefined, false),
    ).toBe("This question is no longer available because the orchestration has ended.");
  });

  it("says the orchestration was stopped when it was cancelled rather than ended", () => {
    expect(
      workflowDecisionUnavailableMessage(DECISION, runStatus("cancelled"), undefined, false),
    ).toBe("This question is no longer available because the orchestration was stopped.");
  });

  it("keeps an ANSWERED question available-looking after the run completes", () => {
    expect(
      workflowDecisionUnavailableMessage(DECISION, runStatus("completed"), undefined, true),
    ).toBeUndefined();
  });

  it("keeps an ANSWERED question intact when the historical phase is terminal too", () => {
    // Both retirement sources at once — the live status AND the phase recorded on the message's
    // own progress. Answered still wins over both.
    expect(
      workflowDecisionUnavailableMessage(
        DECISION,
        runStatus("failed"),
        progress("completed"),
        true,
      ),
    ).toBeUndefined();
  });

  it("retires an unanswered question from the historical phase alone", () => {
    expect(workflowDecisionUnavailableMessage(DECISION, undefined, progress("failed"), false)).toBe(
      "This question is no longer available because the orchestration has ended.",
    );
  });

  it("leaves a live run's unanswered question alone", () => {
    expect(
      workflowDecisionUnavailableMessage(DECISION, runStatus("suspended"), undefined, false),
    ).toBeUndefined();
  });

  it("ignores a terminal status belonging to a DIFFERENT run", () => {
    const otherRun = { runId: "run-2", status: "completed" } as unknown as Parameters<
      typeof workflowDecisionUnavailableMessage
    >[1];
    expect(
      workflowDecisionUnavailableMessage(DECISION, otherRun, undefined, false),
    ).toBeUndefined();
  });

  it("returns nothing when there is no decision at all", () => {
    expect(workflowDecisionUnavailableMessage(null, runStatus("completed"), undefined, false)).toBe(
      undefined,
    );
  });
});
