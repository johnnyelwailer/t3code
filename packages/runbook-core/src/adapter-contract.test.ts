import { describe, expect, it } from "vite-plus/test";

import { createDurableRuntime } from "./durableRuntime.ts";
import { createWorkflowEngine, type WorkflowReference } from "./engine.ts";
import { buildJournalMaps } from "./journalReader.ts";
import type { JournalStore } from "./journalStore.ts";
import { toResolvedWire, toWire, type ResolvedWireInput } from "./journalWriter.ts";

class MemoryJournalStore implements JournalStore {
  readonly wires: unknown[] = [];
  private readonly metas = new Map<string, Parameters<JournalStore["writeRunMeta"]>[1]>();

  async appendEntry(runId: string, entry: Parameters<JournalStore["appendEntry"]>[1]) {
    if (runId !== "host-run") throw new Error(`unexpected run ${runId}`);
    this.wires.push(toWire(entry));
  }

  async appendResolved(runId: string, resolved: ResolvedWireInput) {
    if (runId !== "host-run") throw new Error(`unexpected run ${runId}`);
    this.wires.push(toResolvedWire(resolved));
  }

  async readEntries(runId: string) {
    if (runId !== "host-run") return buildJournalMaps([]);
    return buildJournalMaps(this.wires);
  }

  async readRunMeta(runId: string) {
    return this.metas.get(runId);
  }

  async writeRunMeta(runId: string, meta: Parameters<JournalStore["writeRunMeta"]>[1]) {
    this.metas.set(runId, meta);
  }

  async hasRun(runId: string) {
    return this.metas.has(runId);
  }

  async clear(runId: string) {
    this.wires.length = 0;
    this.metas.delete(runId);
  }

  locator(runId: string) {
    return `memory://${runId}`;
  }
}

interface HostWorkflowRef extends WorkflowReference {
  readonly kind: "workflow";
}

interface HostOptions {
  readonly store?: JournalStore;
}

describe("@runbook/core adapter contract", () => {
  it("supports a second host through primitive, handle, resume, and replay ports", async () => {
    const store = new MemoryJournalStore();
    let primitiveExecutions = 0;
    let deliveries = 0;
    let pendingCorrelation: string | undefined;
    const ref: HostWorkflowRef = {
      kind: "workflow",
      path: "review.workflow.ts",
      absolutePath: "/host/review.workflow.ts",
    };
    const engine = createWorkflowEngine<HostWorkflowRef, HostOptions>({
      defaultRunsRoot: () => "memory://runs",
      createStore: () => store,
      newRunId: () => "host-run",
      nowIso: () => "2026-08-02T00:00:00.000Z",
      executeBody: async ({ runId, ref: workflowRef, args, journal, sink }) => {
        const runtime = createDurableRuntime({
          journal: journal.bySeq,
          resolved: journal.byCorrelation,
          writer: sink,
          runId,
          filePath: workflowRef.absolutePath,
          source: { now: () => 1_700_000_000_000, random: () => 0.5, uuid: () => "host-uuid" },
          nowIso: () => "2026-08-02T00:00:00.000Z",
        });
        const lookup = await runtime.callPrimitive({
          kind: "host.lookup",
          refId: "lookup",
          args,
          exec: async () => {
            primitiveExecutions += 1;
            return { accepted: true };
          },
        });
        const correlationId = await runtime.handles.send({
          kind: "host.approval",
          refId: "approval",
          args: { question: "continue" },
          fire: async (id) => {
            deliveries += 1;
            pendingCorrelation = id;
          },
        });
        const approval = await runtime.handles.awaitResolution(correlationId, undefined);
        return { lookup, approval };
      },
    });

    await expect(engine.startWorkflow(ref, { ticket: "T-1" }, { store })).resolves.toEqual({
      runId: "host-run",
      suspended: true,
      correlationId: "host-run:2",
    });
    expect(primitiveExecutions).toBe(1);
    expect(deliveries).toBe(1);
    expect(pendingCorrelation).toBe("host-run:2");

    await store.appendResolved("host-run", {
      correlationId: pendingCorrelation!,
      kind: "host.approval",
      refId: "approval",
      reply: { approved: true },
      startedAt: "2026-08-02T00:00:01.000Z",
      endedAt: "2026-08-02T00:00:01.000Z",
    });
    await expect(
      engine.resumeWorkflow("host-run", ref, { ticket: "T-1" }, { store }),
    ).resolves.toEqual({
      runId: "host-run",
      result: { lookup: { accepted: true }, approval: { approved: true } },
    });

    const wireCount = store.wires.length;
    await expect(
      engine.resumeWorkflow("host-run", ref, { ticket: "T-1" }, { store }),
    ).resolves.toEqual({
      runId: "host-run",
      result: { lookup: { accepted: true }, approval: { approved: true } },
    });
    expect(store.wires).toHaveLength(wireCount);
    expect(primitiveExecutions).toBe(1);
    expect(deliveries).toBe(1);
  });
});
