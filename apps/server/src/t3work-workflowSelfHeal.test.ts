import { describe, expect, it, vi } from "vite-plus/test";

import {
  canAttemptWorkflowRepair,
  coordinateWorkflowRepair,
  parseWorkflowRepairChildResult,
} from "./t3work-workflowSelfHeal.ts";
import {
  awaitWorkflowRepairChildReply,
  remainingWorkflowRepairBudget,
} from "./t3work-workflowEngineLaunch.ts";
import { workflowRepairIsStopped } from "./t3work-workflowEngineRepair.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { workflowAdmissionQueue } from "./t3work-workflowAdmissionQueue.ts";
import { validateWorkflowRepairCandidate } from "./t3work-workflowRepairGuardrails.ts";

const intent = {
  goal: "Fix review",
  expectedOutcome: "Valid workflow",
  guardrails: ["No new thread"],
};
const source = "export default async () => thread.askUser('Continue?')";

const run = async (overrides: Partial<Parameters<typeof coordinateWorkflowRepair>[0]> = {}) => {
  const phases: string[] = [];
  const calls: string[] = [];
  const result = await coordinateWorkflowRepair({
    origin: "ephemeral",
    repairAttempts: 0,
    source,
    failure: "SyntaxError: bad token",
    intent,
    args: { review: true },
    workspaceRoot: "/repo",
    generateRepair: async () => ({ kind: "replacement", source }),
    replaceSource: async () => {
      calls.push("replace-same-workflow.ts");
    },
    resumeWorkflowAfterRepair: async () => {
      calls.push("resume-same-run");
      return true;
    },
    recordAudit: async () => {
      calls.push("audit");
    },
    activity: async (phase) => {
      phases.push(phase);
    },
    ...overrides,
  });
  return { result, phases, calls };
};

describe("workflow self-heal coordinator", () => {
  it("never starts or resumes self-heal after a Stop tombstone", () => {
    const registry = makeWorkflowEngineRegistry();
    registry.registerRun("stopped-repair", { resume: async () => {}, cancel: () => {} });
    workflowAdmissionQueue.cancel("stopped-repair");
    expect(
      workflowRepairIsStopped({ runId: "stopped-repair", registry }, { isCancelled: () => false }),
    ).toBe(true);
    workflowAdmissionQueue.resetForTests();
  });
  it("rejects repaired meta that widens capabilities and accepts an equal envelope", () => {
    const original =
      'export const meta = { name: "safe", capabilities: ["user"], toolGroups: ["read"], permissions: ["view"] };\nthread.askUser("go");';
    const valid =
      'export const meta = { name: "safe", capabilities: ["user"], toolGroups: ["read"], permissions: ["view"] };\nreturn 1;';
    const widened =
      'export const meta = { name: "safe", capabilities: ["user", "admin"], toolGroups: ["read"], permissions: ["view"] };\nreturn 1;';
    expect(
      validateWorkflowRepairCandidate({
        originalSource: original,
        replacementSource: valid,
        absolutePath: "/tmp/safe.workflow.ts",
      }),
    ).toBe(valid);
    expect(
      validateWorkflowRepairCandidate({
        originalSource: original,
        replacementSource: widened,
        absolutePath: "/tmp/safe.workflow.ts",
      }),
    ).toBeNull();

    const plainOriginal = original.replace("export const meta", "const meta");
    expect(
      validateWorkflowRepairCandidate({
        originalSource: plainOriginal,
        replacementSource: valid,
        absolutePath: "/tmp/plain-to-exported.workflow.ts",
      }),
    ).toBe(valid);
  });
  it("accepts only the exact repair-child JSON protocol", () => {
    expect(
      parseWorkflowRepairChildResult(
        '{"safeToResume":true,"correctedWorkflow":"thread.askUser()","summary":"fixed"}',
      ),
    ).toEqual({ outcome: "fixed", updatedSource: "thread.askUser()", summary: "fixed" });
    expect(
      parseWorkflowRepairChildResult('{"safeToResume":false,"cancelReason":"unsafe change"}'),
    ).toEqual({ outcome: "cannot-fix", reason: "unsafe change" });
    expect(
      parseWorkflowRepairChildResult(
        '{"outcome":"fixed","updatedSource":"thread.askUser()","summary":"fixed"}',
      ),
    ).toEqual({ outcome: "fixed", updatedSource: "thread.askUser()", summary: "fixed" });
    expect(
      parseWorkflowRepairChildResult('{"outcome":"cannot-fix","reason":"unsupported"}'),
    ).toEqual({ outcome: "cannot-fix", reason: "unsupported" });
    expect(
      parseWorkflowRepairChildResult(
        '{"outcome":"fixed","updatedSource":"x","summary":"y","extra":true}',
      ),
    ).toBeNull();
    expect(parseWorkflowRepairChildResult("```json\n{}\n```")).toBeNull();
    expect(
      parseWorkflowRepairChildResult(
        '{"safeToResume":true,"correctedWorkflow":"x","summary":"y","extra":true}',
      ),
    ).toBeNull();
  });
  it("repairs once in the same run/card boundary", async () => {
    const { result, phases, calls } = await run();
    expect(result).toEqual({ kind: "recovered", repairAttempts: 1 });
    expect(phases).toEqual(["analysing", "repairing", "resuming", "recovered"]);
    expect(calls).toEqual(["replace-same-workflow.ts", "resume-same-run", "audit"]);
  });

  it("records a visible failure when provider cannot repair", async () => {
    const { result, phases, calls } = await run({
      generateRepair: async () => ({ kind: "cannotRepair", reason: "unsupported" }),
    });
    expect(result).toEqual({ kind: "failed", repairAttempts: 1, reason: "unsupported" });
    expect(phases).toEqual(["analysing", "failed"]);
    expect(calls).toEqual(["audit"]);
  });

  it("does not call provider for policy/auth/cancel failures", async () => {
    let generated = false;
    const { result } = await run({
      failure: "Authentication required",
      generateRepair: async () => {
        generated = true;
        return { kind: "replacement", source };
      },
    });
    expect(result).toEqual({ kind: "not-attempted" });
    expect(generated).toBe(false);
  });

  it("keeps one attempt after resume fails", async () => {
    const { result, phases } = await run({ resumeWorkflowAfterRepair: async () => false });
    expect(result).toEqual({
      kind: "failed",
      repairAttempts: 1,
      reason: "Repaired workflow could not resume from its stable checkpoint.",
    });
    expect(phases).toEqual(["analysing", "repairing", "resuming", "failed"]);
  });

  it("allows exactly three configured repair attempts before exhaustion", () => {
    const input = { origin: "ephemeral" as const, maxAttempts: 3, error: "SyntaxError: bad token" };
    expect(
      [0, 1, 2].map((repairAttempts) => canAttemptWorkflowRepair({ ...input, repairAttempts })),
    ).toEqual([true, true, true]);
    expect(canAttemptWorkflowRepair({ ...input, repairAttempts: 3 })).toBe(false);
  });

  it("times out a repair child and cleans its pending reactor slot", async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn();
    const pending = new Promise<string>(() => {});
    const result = awaitWorkflowRepairChildReply({
      reply: pending,
      timeoutMs: 120,
      onTimeout: cleanup,
    });
    const rejected = expect(result).rejects.toThrow("timed out after 120ms");
    await vi.advanceTimersByTimeAsync(120);
    await rejected;
    expect(cleanup).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("shares one repair deadline across attempts", () => {
    const deadline = 900_000;
    expect(remainingWorkflowRepairBudget(deadline, 0)).toBe(900_000);
    expect(remainingWorkflowRepairBudget(deadline, 120_000)).toBe(780_000);
    expect(remainingWorkflowRepairBudget(deadline, 900_001)).toBe(0);
  });
});
