// @effect-diagnostics nodeBuiltinImport:off - drives the real on-disk journal, the store a host
// re-fires against after its model step failed out of band.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Schema from "effect/Schema";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "@runbook/core/durableRuntime";
import { createWorkflowEngine } from "@runbook/core/engine";
import type { WorkflowReference } from "@runbook/core/engineTypes";
import { FsJournalStore, type JournalStore } from "@runbook/core/journalStore";

import { createAskVerb } from "./askVerb.ts";
import type { MessageEnvelope } from "./broker.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

type StepOutcome = "fail-out-of-band" | "crash" | "answer";

/**
 * A host whose one schema'd `thread.turn` step keeps failing: the model call dies out of band (the
 * run stays parked) or the host crashes mid-send. The host's recovery is `resume({ refire })`.
 */
function makeHost() {
  const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-refire-"));
  roots.push(runsRoot);
  const store = new FsJournalStore(runsRoot);
  const sent: MessageEnvelope[] = [];
  const step = { outcome: "fail-out-of-band" as StepOutcome };
  const schema = Schema.Struct({ summary: Schema.String }) as Schema.Schema<unknown>;
  const engine = createWorkflowEngine<WorkflowReference, { store?: JournalStore; refire?: string }>(
    {
      workflowPath: (ref) => ref.path,
      defaultRunsRoot: () => runsRoot,
      createStore: () => store,
      newRunId: () => "run-1",
      nowIso: () => "2026-09-23T00:00:00.000Z",
      executeBody: async (request) => {
        const runtime = createDurableRuntime({
          journal: request.journal.bySeq,
          resolved: request.journal.byCorrelation,
          writer: request.sink,
          source: { now: () => 1, random: () => 0.5, uuid: () => "u" },
          runId: request.runId,
          suspension: request.suspension,
          refire: request.refire,
        });
        const ask = createAskVerb({
          dispatch: runtime.handles,
          defaultModel: undefined,
          broker: {
            send: async (envelope, resolver) => {
              sent.push(envelope);
              if (step.outcome === "crash") throw new Error("host crashed mid-send");
              if (step.outcome === "answer") resolver.resolve(JSON.stringify({ summary: "ok" }));
            },
          },
        });
        return await ask("thread.turn", "thread-1", "Summarize", { schema });
      },
    },
  );
  const ref: WorkflowReference = { path: "review.workflow.ts" };
  return {
    sent,
    step,
    start: () => engine.startWorkflow(ref, {}, { store }),
    refire: (correlationId: string) =>
      engine.resumeWorkflow("run-1", ref, {}, { store, refire: correlationId }),
    journal: () => store.readEntries("run-1"),
  };
}

describe("re-firing a failed schema'd ask", () => {
  it("survives three failed re-fires and decodes the fourth reply, burning zero schema attempts", async () => {
    const host = makeHost();
    expect(await host.start()).toMatchObject({ suspended: true, correlationId: "run-1:1" });

    host.step.outcome = "crash";
    await expect(host.refire("run-1:1")).rejects.toThrow("host crashed mid-send");
    host.step.outcome = "fail-out-of-band";
    expect(await host.refire("run-1:1")).toMatchObject({ suspended: true });
    host.step.outcome = "crash";
    await expect(host.refire("run-1:1")).rejects.toThrow("host crashed mid-send");

    // MAX_SCHEMA_ATTEMPTS is 3: had any of those consumed an attempt, this would exhaust.
    host.step.outcome = "answer";
    expect(await host.refire("run-1:1")).toEqual({ runId: "run-1", result: { summary: "ok" } });

    expect(host.sent).toHaveLength(5);
    const [first, ...refires] = host.sent;
    for (const envelope of refires) {
      expect(envelope.correlationId).toBe(first?.correlationId);
      expect(JSON.stringify(envelope.payload)).toBe(JSON.stringify(first?.payload));
      expect(envelope.redelivery).toBe(true);
    }
    expect(first?.redelivery).toBeUndefined();
    // No corrective re-ask ever reached the model: every prompt is the original one.
    for (const envelope of host.sent) {
      expect((envelope.payload as { prompt: string }).prompt).not.toContain("did not match");
    }
    // One ask, one intent line, one reply — the re-fires journaled nothing of their own.
    const journal = await host.journal();
    expect(Array.from(journal.bySeq.keys())).toEqual([1]);
    expect(Array.from(journal.byCorrelation.keys())).toEqual(["run-1:1"]);
  });
});
