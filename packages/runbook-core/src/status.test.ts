// @effect-diagnostics nodeBuiltinImport:off - drives the real journal on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { FsJournalStore } from "./journalStore.ts";
import { inspectRun } from "./status.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const NOW = "2026-08-02T00:00:00.000Z";
const META = { workflowPath: "w.ts", argsHash: "h", createdAt: NOW };

const entry = (
  seq: number,
  kind: "tool" | "usage" | "artifact",
  extra: Record<string, unknown> = {},
) => ({
  seq,
  callId: `${seq}:${kind}:r`,
  kind,
  refId: "r",
  argsHash: "h",
  result: "ok",
  startedAt: NOW,
  endedAt: NOW,
  ...extra,
});

describe("@runbook/core journal-derived run status", () => {
  it("reports an unknown run as empty with zeroed counters", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-status-"));
    roots.push(runsRoot);
    const status = await inspectRun(new FsJournalStore(runsRoot), "nope");
    expect(status).toEqual({
      state: "empty",
      entryCount: 0,
      lastSeq: 0,
      pendingCorrelationIds: [],
      artifacts: [],
      usage: { inputTokens: 0, outputTokens: 0, records: 0 },
    });
  });

  it("reports in-progress for a run with journaled work but no terminal marker", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-status-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    await store.writeRunMeta("run-1", META);
    await store.appendEntry("run-1", entry(1, "tool"));
    await store.appendEntry("run-1", entry(2, "tool"));
    const status = await inspectRun(store, "run-1");
    expect(status.state).toBe("in-progress");
    expect(status.entryCount).toBe(2);
    expect(status.lastSeq).toBe(2);
    expect(status.meta?.workflowPath).toBe("w.ts");
    expect(status.pendingCorrelationIds).toEqual([]);
  });

  it("reports suspended with the pending correlation ids when a handle is sent but unresolved", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-status-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    await store.writeRunMeta("run-1", META);
    await store.appendEntry("run-1", entry(1, "tool"));
    await store.appendEntry(
      "run-1",
      entry(2, "tool", {
        phase: "sent",
        correlationId: "corr-1",
        result: undefined,
      }),
    );
    const status = await inspectRun(store, "run-1");
    expect(status.state).toBe("suspended");
    expect(status.pendingCorrelationIds).toEqual(["corr-1"]);
  });

  it("reports the terminal marker state over any journal content", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-status-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    await store.writeRunMeta("run-1", META);
    await store.appendEntry(
      "run-1",
      entry(1, "usage", {
        result: { inputTokens: 4, outputTokens: 2, at: NOW },
      }),
    );
    for (const terminal of ["completed", "failed", "aborted"] as const) {
      await store.writeRunMeta("run-1", { ...META, terminal, terminalAt: NOW });
      const status = await inspectRun(store, "run-1");
      expect(status.state).toBe(terminal);
      expect(status.meta?.terminal).toBe(terminal);
    }
    // A terminal run with a still-unresolved handle reports the terminal state, not suspended.
    await store.writeRunMeta("run-1", { ...META, terminal: "aborted", terminalAt: NOW });
    await store.appendEntry(
      "run-1",
      entry(2, "tool", {
        phase: "sent",
        correlationId: "corr-9",
        result: undefined,
      }),
    );
    const aborted = await inspectRun(store, "run-1");
    expect(aborted.state).toBe("aborted");
    expect(aborted.usage).toEqual({ inputTokens: 4, outputTokens: 2, records: 1 });
  });
});
