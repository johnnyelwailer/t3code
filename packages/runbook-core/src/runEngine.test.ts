// @effect-diagnostics nodeBuiltinImport:off - these tests drive the real journal on disk;
// the whole point is that durable runs survive a process boundary, which a memory FS cannot show.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { executeWorkflowRun } from "./runEngine.ts";
import { WorkflowSuspended } from "./handles.ts";
import type { JournalStore } from "./journalStore.ts";
import { FsJournalStore } from "./journalStore.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const entry = {
  seq: 1,
  callId: "1:custom.ask:ask",
  kind: "custom.ask" as const,
  refId: "ask",
  argsHash: "args",
  result: undefined,
  phase: "sent" as const,
  correlationId: "run-1:1",
  startedAt: "2026-08-02T00:00:00.000Z",
  endedAt: "2026-08-02T00:00:00.000Z",
};

describe("@runbook/core run loop", () => {
  it("flushes a suspended body's journal before returning the suspension", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-run-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    const result = await executeWorkflowRun({
      runId: "run-1",
      ref: { path: "review.workflow.ts" },
      args: {},
      runsRoot,
      store,
      options: {},
      body: async ({ sink }) => {
        sink.append(entry);
        throw new WorkflowSuspended("run-1:1");
      },
    });

    expect(result).toEqual({ kind: "suspended", correlationId: "run-1:1" });
    expect((await store.readEntries("run-1")).bySeq.get(1)).toMatchObject(entry);
  });

  it("does not report suspension when the journal durability barrier fails", async () => {
    const failure = new Error("append failed");
    const store: JournalStore = {
      appendEntry: async () => {
        throw failure;
      },
      appendResolved: async () => {},
      readEntries: async () => ({ bySeq: new Map(), byCorrelation: new Map() }),
      readRunMeta: async () => undefined,
      writeRunMeta: async () => {},
      hasRun: async () => true,
      clear: async () => {},
      locator: () => "memory://run-1",
    };

    await expect(
      executeWorkflowRun({
        runId: "run-1",
        ref: { path: "review.workflow.ts" },
        args: {},
        runsRoot: "/tmp",
        store,
        options: {},
        body: async ({ sink }) => {
          sink.append(entry);
          throw new WorkflowSuspended("run-1:1");
        },
      }),
    ).rejects.toBe(failure);
  });
});
