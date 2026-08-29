// @effect-diagnostics nodeBuiltinImport:off - drives a real FsJournalStore in a temp runs root.
/**
 * The two properties the auto-report seam exists for.
 *
 * (a) REPLAY DETERMINISM — the composition is journaled, so a replayed run re-renders the recorded
 *     report instead of asking a model again. Driven against a REAL `FsJournalStore` rather than a
 *     stub, so the wire encode/decode round trip and the reserved-seq choice are actually
 *     exercised, and so the "the report entry does not disturb the body's replay positions" claim
 *     is checked against the same reader the engine uses.
 *
 * (b) THE COMPOSER CANNOT EAT THE REPORT — every composer failure (no model, an error, a timeout,
 *     junk output) still delivers the run's facts, rendered structurally. "A prettifier that can
 *     lose the payload is worse than no prettifier."
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { FsJournalStore, type JournalStore } from "@t3team/sdk";
import { createModelSelection } from "@t3tools/shared/model";
import { ProviderInstanceId } from "@t3tools/contracts";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  composeWorkflowRunReport,
  type GenerateWorkflowReport,
} from "./t3team-workflowReportCompose.ts";
import { WORKFLOW_REPORT_JOURNAL_SEQ } from "./t3team-workflowReportJournal.ts";
import type { WorkflowRunReportFacts } from "./t3team-workflowReportTypes.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-report-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const modelSelection = createModelSelection(ProviderInstanceId.make("codex"), "utility-model");
const nowIso = (): string => "2026-08-29T12:00:00.000Z";

/** A run that finished green and still missed what it was asked for — the motivating shape. */
function facts(runId: string): WorkflowRunReportFacts {
  return {
    runId,
    status: "completed",
    output: { delivered: false, reason: "QA failed", blockers: ["output parity", "benchmark"] },
    failureReason: null,
    failureStep: null,
    intent: {
      goal: "Port the extractor and ship it",
      expectedOutcome: "byte-identical output and a benchmark within 5% of baseline",
      guardrails: ["never push to main"],
    },
    steps: [
      {
        workflowRunId: runId,
        stepId: `${runId}:1`,
        stepKind: "thread.turn",
        phase: "completed",
        detail: "Port the extractor",
        durationMs: 91_000,
        threadId: "child-1",
      },
      {
        workflowRunId: runId,
        stepId: `${runId}:2`,
        stepKind: "thread.turn",
        phase: "failed",
        detail: "QA gate",
        error: "output parity mismatch on 3 of 40 fixtures",
        durationMs: 240_000,
        threadId: "child-2",
      },
    ],
    transcripts: [
      {
        threadId: "child-2",
        label: "QA gate",
        text: "…40 fixtures, 3 differ on trailing whitespace…",
      },
    ],
  };
}

const goodReport = {
  verdict: "QA failed — nothing was pushed. 2 blockers, both diagnosed.",
  body: "| Check | Result |\n| --- | --- |\n| parity | 37/40 |",
  recipient: "agent" as const,
  recipientReason: "Both blockers are small and already root-caused in a worktree the agent holds.",
};

function store(): JournalStore {
  return new FsJournalStore(runsRoot);
}

/** A generator that records how many times it was actually asked to compose. */
function countingGenerate(result: unknown | (() => Promise<unknown>)): {
  readonly generate: GenerateWorkflowReport;
  readonly calls: () => number;
} {
  let calls = 0;
  return {
    calls: () => calls,
    generate: async () => {
      calls += 1;
      return typeof result === "function" ? await (result as () => Promise<unknown>)() : result;
    },
  };
}

describe("composeWorkflowRunReport", () => {
  it("composes a structured report from a realistic run fixture", async () => {
    const model = countingGenerate(goodReport);
    const record = await composeWorkflowRunReport({
      facts: facts("run-compose-1"),
      store: store(),
      generate: model.generate,
      modelSelection,
      nowIso,
    });

    expect(record.origin).toBe("composed");
    expect(record.report).toEqual(goodReport);
    expect(record.fallbackReason).toBeUndefined();
    expect(model.calls()).toBe(1);
  });

  it("hands the composer the intent, the steps and the transcripts to judge from", async () => {
    let seen = "";
    await composeWorkflowRunReport({
      facts: facts("run-compose-prompt"),
      store: store(),
      generate: async ({ prompt }) => {
        seen = prompt;
        return goodReport;
      },
      modelSelection,
      nowIso,
    });

    expect(seen).toContain("byte-identical output and a benchmark within 5% of baseline");
    expect(seen).toContain("QA gate");
    expect(seen).toContain("output parity mismatch on 3 of 40 fixtures");
    expect(seen).toContain("trailing whitespace");
    // The transcripts arrive labelled as source material, never as text to forward.
    expect(seen).toContain("never forward any of this text as-is");
  });

  it("a replayed run returns the journaled composition and never re-composes", async () => {
    const runId = "run-compose-replay";
    const first = countingGenerate(goodReport);
    const original = await composeWorkflowRunReport({
      facts: facts(runId),
      store: store(),
      generate: first.generate,
      modelSelection,
      nowIso,
    });

    // A later drive of the same run — a fresh store handle, a different clock, and a model that
    // would answer DIFFERENTLY if it were ever asked.
    const second = countingGenerate({ ...goodReport, verdict: "a different verdict entirely" });
    const replayed = await composeWorkflowRunReport({
      facts: facts(runId),
      store: store(),
      generate: second.generate,
      modelSelection,
      nowIso: () => "2999-01-01T00:00:00.000Z",
    });

    expect(second.calls()).toBe(0);
    expect(replayed).toEqual(original);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(original));
  });

  it("journals the report beside the body's positions, never inside them", async () => {
    const runId = "run-compose-positions";
    const journal = store();
    // A body that already journaled two primitives, at the seqs `takeSeq` really produces (1, 2).
    for (const seq of [1, 2]) {
      await journal.appendEntry(runId, {
        seq,
        callId: `${seq}:tool:probe`,
        kind: "tool",
        refId: "probe",
        argsHash: "hash",
        result: { ok: seq },
        startedAt: nowIso(),
        endedAt: nowIso(),
      });
    }
    await composeWorkflowRunReport({
      facts: facts(runId),
      store: journal,
      generate: countingGenerate(goodReport).generate,
      modelSelection,
      nowIso,
    });

    const entries = await journal.readEntries(runId);
    // The body's own positions are untouched, and the highest recorded seq (what the replay
    // engine's gap-drift check reads) is still the body's.
    expect(entries.bySeq.get(1)?.result).toEqual({ ok: 1 });
    expect(entries.bySeq.get(2)?.result).toEqual({ ok: 2 });
    expect(Math.max(...entries.bySeq.keys())).toBe(2);
    expect(entries.bySeq.get(WORKFLOW_REPORT_JOURNAL_SEQ)?.kind).toBe("workflow.report");
    // And it occupies no correlation slot, so no pending ask is invented.
    expect(entries.byCorrelation.size).toBe(0);
  });
});

describe("the composer cannot eat the report", () => {
  const expectFactsIntact = (body: string): void => {
    expect(body).toContain("byte-identical output and a benchmark within 5% of baseline");
    expect(body).toContain("QA gate");
    expect(body).toContain("output parity mismatch on 3 of 40 fixtures");
    expect(body).toContain("240000ms");
    expect(body).toContain("QA failed");
  };

  it("falls back with the facts intact when the composer throws", async () => {
    const record = await composeWorkflowRunReport({
      facts: facts("run-fallback-throw"),
      store: store(),
      generate: async () => {
        throw new Error("driver exploded");
      },
      modelSelection,
      nowIso,
    });

    expect(record.origin).toBe("fallback");
    expect(record.fallbackReason).toBe("driver exploded");
    expect(record.report.verdict.length).toBeGreaterThan(0);
    expectFactsIntact(record.report.body);
    // A degraded report never spends an agent turn.
    expect(record.report.recipient).toBe("user");
  });

  it("falls back when the composer overruns its timeout", async () => {
    const record = await composeWorkflowRunReport({
      facts: facts("run-fallback-timeout"),
      store: store(),
      generate: () => new Promise(() => {}), // never settles
      modelSelection,
      nowIso,
      timeoutMs: 20,
    });

    expect(record.origin).toBe("fallback");
    expect(record.fallbackReason).toContain("timed out");
    expectFactsIntact(record.report.body);
  });

  it("falls back when the composer returns junk", async () => {
    const record = await composeWorkflowRunReport({
      facts: facts("run-fallback-junk"),
      store: store(),
      generate: async () => ({ nonsense: true }),
      modelSelection,
      nowIso,
    });

    expect(record.origin).toBe("fallback");
    expectFactsIntact(record.report.body);
  });

  it("falls back when the composer returns an empty verdict", async () => {
    const record = await composeWorkflowRunReport({
      facts: facts("run-fallback-empty"),
      store: store(),
      generate: async () => ({ ...goodReport, verdict: "   " }),
      modelSelection,
      nowIso,
    });

    expect(record.origin).toBe("fallback");
    expect(record.fallbackReason).toContain("empty verdict");
    expectFactsIntact(record.report.body);
  });

  it("falls back when no utility model is configured at all", async () => {
    const record = await composeWorkflowRunReport({
      facts: facts("run-fallback-nomodel"),
      store: store(),
      nowIso,
    });

    expect(record.origin).toBe("fallback");
    expect(record.fallbackReason).toContain("No utility model");
    expectFactsIntact(record.report.body);
  });

  it("still reports a failed run that returned nothing", async () => {
    const record = await composeWorkflowRunReport({
      facts: {
        runId: "run-fallback-failed",
        status: "failed",
        failureReason: "Workflow body threw: cannot read property 'id' of undefined",
        failureStep: "phase:qa (thread.turn)",
        steps: [],
      },
      store: store(),
      nowIso,
    });

    expect(record.report.verdict).toContain("Run failed.");
    expect(record.report.verdict).toContain("cannot read property");
    expect(record.report.body).toContain("phase:qa (thread.turn)");
  });

  it("a fallback is journaled too, so a replay does not silently upgrade to a composed one", async () => {
    const runId = "run-fallback-journaled";
    const first = await composeWorkflowRunReport({ facts: facts(runId), store: store(), nowIso });
    const model = countingGenerate(goodReport);
    const second = await composeWorkflowRunReport({
      facts: facts(runId),
      store: store(),
      generate: model.generate,
      modelSelection,
      nowIso,
    });

    expect(model.calls()).toBe(0);
    expect(second).toEqual(first);
    expect(second.origin).toBe("fallback");
  });
});
