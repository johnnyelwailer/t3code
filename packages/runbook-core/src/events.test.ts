// @effect-diagnostics nodeBuiltinImport:off - these tests drive the real journal on disk;
// the whole point is that lifecycle events pair with durable run metadata.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createWorkflowEngine } from "./engine.ts";
import type { WorkflowReference } from "./engineTypes.ts";
import { WorkflowAborted } from "./errors.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { WorkflowEvent, WorkflowEventSink } from "./events.ts";
import { FsJournalStore } from "./journalStore.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const collect = (): { events: WorkflowEvent[]; sink: WorkflowEventSink } => {
  const events: WorkflowEvent[] = [];
  return { events, sink: { on: (event) => events.push(event) } };
};

const makeEngine = (
  runsRoot: string,
  executeBody: (request: { abortSignal?: AbortSignal }) => Promise<unknown>,
) =>
  createWorkflowEngine<
    WorkflowReference,
    { runsRoot?: string; events?: WorkflowEventSink; abortSignal?: AbortSignal }
  >({
    workflowPath: (ref) => ref.path,
    defaultRunsRoot: () => runsRoot,
    createStore: (root) => new FsJournalStore(root),
    newRunId: () => "run-1",
    nowIso: () => "2026-08-02T00:00:00.000Z",
    executeBody: async (request) => {
      const { abortSignal } = request;
      return await executeBody(abortSignal === undefined ? {} : { abortSignal });
    },
  });

describe("@runbook/core lifecycle events", () => {
  it("emits run.started then run.completed on a fresh start, tagged with the run id and host clock", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const { events, sink } = collect();
    const engine = makeEngine(runsRoot, async () => ({ ok: true }));
    const result = await engine.startWorkflow({ path: "w.ts" }, {}, { runsRoot, events: sink });
    expect(result).toEqual({ runId: "run-1", result: { ok: true } });
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.completed"]);
    expect(events[0]).toMatchObject({ type: "run.started", startKind: "start", runId: "run-1" });
    for (const event of events) expect(event.at).toBe("2026-08-02T00:00:00.000Z");
  });

  it("emits run.started (resume) then run.completed when a suspended run is driven to completion", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const ref: WorkflowReference = { path: "w.ts" };
    let suspended = true;
    const engine = makeEngine(runsRoot, async () => {
      if (suspended) throw new WorkflowSuspended("corr-1");
      return { done: true };
    });
    const first = collect();
    const firstResult = await engine.startWorkflow(ref, {}, { runsRoot, events: first.sink });
    expect(firstResult).toEqual({ runId: "run-1", suspended: true, correlationId: "corr-1" });
    expect(first.events.map((event) => event.type)).toEqual(["run.started", "run.suspended"]);
    expect(first.events[1]).toMatchObject({ type: "run.suspended", correlationId: "corr-1" });

    suspended = false;
    const second = collect();
    const secondResult = await engine.resumeWorkflow(
      "run-1",
      ref,
      {},
      { runsRoot, events: second.sink },
    );
    expect(secondResult).toEqual({ runId: "run-1", result: { done: true } });
    expect(second.events.map((event) => event.type)).toEqual(["run.started", "run.completed"]);
    expect(second.events[0]).toMatchObject({ type: "run.started", startKind: "resume" });
  });

  it("emits run.failed, marks the run failed in metadata, and rethrows the original error", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const { events, sink } = collect();
    const engine = makeEngine(runsRoot, async () => {
      throw new Error("boom");
    });
    await expect(
      engine.startWorkflow({ path: "w.ts" }, {}, { runsRoot, events: sink }),
    ).rejects.toThrow("boom");
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.failed"]);
    expect(events[1]).toMatchObject({ type: "run.failed", error: "boom" });
    const meta = await new FsJournalStore(runsRoot).readRunMeta("run-1");
    expect(meta?.terminal).toBe("failed");
    expect(meta?.terminalAt).toBe("2026-08-02T00:00:00.000Z");
  });

  it("settles a pre-aborted start as aborted: marker, events, and a refused resume", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const { events, sink } = collect();
    const controller = new AbortController();
    controller.abort();
    const engine = makeEngine(runsRoot, async () => {
      throw new Error("body must not run");
    });
    const result = await engine.startWorkflow(
      { path: "w.ts" },
      {},
      { runsRoot, events: sink, abortSignal: controller.signal },
    );
    expect(result).toEqual({ runId: "run-1", aborted: true });
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.aborted"]);
    const meta = await new FsJournalStore(runsRoot).readRunMeta("run-1");
    expect(meta?.terminal).toBe("aborted");
    await expect(
      engine.resumeWorkflow("run-1", { path: "w.ts" }, {}, { runsRoot }),
    ).rejects.toThrow("aborted");
  });

  it("converts a WorkflowAborted thrown by the body into the aborted outcome", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const { events, sink } = collect();
    const engine = makeEngine(runsRoot, async () => {
      throw new WorkflowAborted();
    });
    const result = await engine.startWorkflow({ path: "w.ts" }, {}, { runsRoot, events: sink });
    expect(result).toEqual({ runId: "run-1", aborted: true });
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.aborted"]);
    const meta = await new FsJournalStore(runsRoot).readRunMeta("run-1");
    expect(meta?.terminal).toBe("aborted");
  });

  it("keeps the durable aborted marker when the run.aborted listener throws", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    // A throwing observer must not propagate into the settle funnel: without the guard the
    // exception after writeTerminalMeta("aborted") would land in settleRunFailed and rewrite
    // the terminal marker to "failed".
    const engine = makeEngine(runsRoot, async () => {
      throw new WorkflowAborted();
    });
    const result = await engine.startWorkflow(
      { path: "w.ts" },
      {},
      {
        runsRoot,
        events: {
          on: () => {
            throw new Error("observer blew up");
          },
        },
      },
    );
    expect(result).toEqual({ runId: "run-1", aborted: true });
    const meta = await new FsJournalStore(runsRoot).readRunMeta("run-1");
    expect(meta?.terminal).toBe("aborted");
  });

  it("refuses a pre-aborted resume without clobbering the run's prior terminal state", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-events-"));
    roots.push(runsRoot);
    const { events, sink } = collect();
    const engine = makeEngine(runsRoot, async () => "done");
    await engine.startWorkflow({ path: "w.ts" }, {}, { runsRoot, events: sink });
    const controller = new AbortController();
    controller.abort();
    await expect(
      engine.resumeWorkflow(
        "run-1",
        { path: "w.ts" },
        {},
        {
          runsRoot,
          abortSignal: controller.signal,
        },
      ),
    ).rejects.toThrow("already aborted");
    // The completed marker survives: the refused resume wrote nothing and emitted nothing.
    const meta = await new FsJournalStore(runsRoot).readRunMeta("run-1");
    expect(meta?.terminal).toBe("completed");
    expect(events.map((event) => event.type)).toEqual(["run.started", "run.completed"]);
  });
});
