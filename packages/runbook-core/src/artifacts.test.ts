// @effect-diagnostics nodeBuiltinImport:off - drives the real journal on disk for inspectRun.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createArtifactEmitter, type ArtifactRecord } from "./artifacts.ts";
import { createDurableRuntime } from "./durableRuntime.ts";
import { FsJournalStore } from "./journalStore.ts";
import type { JournalEntry } from "./journalReader.ts";
import { inspectRun } from "./status.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const source = { now: () => 1_700_000_000_000, random: () => 0.25, uuid: () => "artifact-uuid-1" };
const NOW = "2026-08-02T00:00:00.000Z";

const makeRuntime = (
  journal: ReadonlyMap<number, JournalEntry>,
  sink: {
    append(entry: JournalEntry): void;
    appendResolved(entry: unknown): void;
    flush(): Promise<void>;
    dispose(): void;
  },
) =>
  createDurableRuntime({
    journal,
    writer: sink,
    source,
    runId: "run-1",
    nowIso: () => NOW,
  });

describe("@runbook/core artifact emission", () => {
  it("mints a deterministic artifact record through the journal and replays it verbatim", async () => {
    const live: JournalEntry[] = [];
    const liveSink = {
      append: (entry: JournalEntry) => live.push(entry),
      appendResolved: () => {},
      flush: async () => {},
      dispose: () => {},
    };
    const runtime = makeRuntime(new Map(), liveSink);
    const emit = createArtifactEmitter({
      callPrimitive: runtime.callPrimitive,
      hostUuid: source.uuid,
      nowIso: () => NOW,
    }).emit;

    const record = await emit({ type: "report", title: "Q3", data: { rows: 3 } });
    expect(record).toEqual({
      id: "artifact-uuid-1",
      type: "report",
      title: "Q3",
      data: { rows: 3 },
      at: NOW,
    });
    // Exactly ONE journal entry: the artifact record itself. No nested uuid entry — the id is
    // host entropy, and a nested entry would break the journal's crash-recovery prefix invariant.
    expect(live.map((entry) => entry.kind)).toEqual(["artifact"]);
    expect(live[0]?.result).toEqual(record);

    // Replay: a fresh runtime over the recorded journal returns the SAME record without exec.
    const replay: JournalEntry[] = [];
    const replaySink = {
      append: (entry: JournalEntry) => replay.push(entry),
      appendResolved: () => {},
      flush: async () => {},
      dispose: () => {},
    };
    const replayed = makeRuntime(new Map(live.map((entry) => [entry.seq, entry])), replaySink);
    const emitAgain = createArtifactEmitter({
      callPrimitive: replayed.callPrimitive,
      hostUuid: source.uuid,
      nowIso: () => NOW,
    }).emit;
    const second = await emitAgain({ type: "report", title: "Q3", data: { rows: 3 } });
    expect(second).toEqual(record);
    expect(replay).toEqual([]); // nothing re-journaled on replay
  });

  it("omits the title key when absent so the journaled record stays canonical", async () => {
    const live: JournalEntry[] = [];
    const sink = {
      append: (entry: JournalEntry) => live.push(entry),
      appendResolved: () => {},
      flush: async () => {},
      dispose: () => {},
    };
    const runtime = makeRuntime(new Map(), sink);
    const record: ArtifactRecord = await createArtifactEmitter({
      callPrimitive: runtime.callPrimitive,
      hostUuid: source.uuid,
      nowIso: () => NOW,
    }).emit({ type: "diff", data: "a" });
    expect("title" in record).toBe(false);
    expect(live[0]?.result).toEqual({ id: "artifact-uuid-1", type: "diff", data: "a", at: NOW });
  });

  it("surfaces journaled artifacts through inspectRun", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-artifacts-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    await store.writeRunMeta("run-1", { workflowPath: "w.ts", argsHash: "h", createdAt: NOW });
    await store.appendEntry("run-1", {
      seq: 1,
      callId: "1:artifact:report",
      kind: "artifact",
      refId: "report",
      argsHash: "h",
      result: { id: "artifact-uuid-1", type: "report", data: { rows: 3 }, at: NOW },
      startedAt: NOW,
      endedAt: NOW,
    });
    const status = await inspectRun(store, "run-1");
    expect(status.artifacts).toEqual([
      { id: "artifact-uuid-1", type: "report", data: { rows: 3 }, at: NOW },
    ]);
  });
});
