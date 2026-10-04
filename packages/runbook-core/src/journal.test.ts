// @effect-diagnostics nodeBuiltinImport:off - these tests drive the real journal on disk;
// the whole point is that durable runs survive a process boundary, which a memory FS cannot show.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createHandleDispatch, createSuspensionLatch, type ReplyResolver } from "./handles.ts";
import { FsJournalStore } from "./journalStore.ts";
import { buildJournalMaps, type JournalEntry, type ResolvedEntry } from "./journalReader.ts";
import { toResolvedWire, type ResolvedWireInput } from "./journalWriter.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

describe("@runbook/core journal", () => {
  it("round-trips adapter-defined primitive kinds", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-core-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    const entry: JournalEntry = {
      seq: 1,
      callId: "1:issue.merge:mergeIssue",
      kind: "issue.merge",
      refId: "mergePullRequest",
      argsHash: "args-hash",
      result: { merged: true },
      startedAt: "2026-08-02T00:00:00.000Z",
      endedAt: "2026-08-02T00:00:00.001Z",
    };

    await store.appendEntry("run-1", entry);

    const maps = await store.readEntries("run-1");
    expect(maps.bySeq.get(1)).toEqual(entry);
  });

  it("carries a resolved line's startedAt into byCorrelation, from disk and from wire rows alike", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-core-"));
    roots.push(runsRoot);
    const store = new FsJournalStore(runsRoot);
    await store.appendResolved("run-1", {
      correlationId: "run-1:1",
      kind: "thread.turn",
      refId: "thread.turn",
      reply: "done",
      startedAt: "2026-09-23T10:00:00.000Z",
      endedAt: "2026-09-23T10:00:00.000Z",
    });
    expect((await store.readEntries("run-1")).byCorrelation.get("run-1:1")).toEqual({
      correlationId: "run-1:1",
      kind: "thread.turn",
      refId: "thread.turn",
      dismissed: false,
      reply: "done",
      startedAt: "2026-09-23T10:00:00.000Z",
    });
    // A DB backend hands the same wire object to buildJournalMaps (see SqliteJournalStore).
    const wire = toResolvedWire({
      correlationId: "run-1:2",
      kind: "user.input",
      refId: "user.input",
      dismissed: true,
      startedAt: "2026-09-23T11:00:00.000Z",
      endedAt: "2026-09-23T11:00:01.000Z",
    });
    expect(buildJournalMaps([wire]).byCorrelation.get("run-1:2")?.startedAt).toBe(
      "2026-09-23T11:00:00.000Z",
    );
    // The wire schema requires startedAt: a resolved line without it is rejected, never mapped.
    const { startedAt: _dropped, ...noTime } = wire;
    expect(() => buildJournalMaps([noTime])).toThrow("startedAt");
  });

  it("gives a live-journaled reply the journaled line's startedAt, and a never-journaled one none", async () => {
    const lines: ResolvedWireInput[] = [];
    const inMemory = new Map<string, ResolvedEntry>();
    let blackBoxed = false;
    let seq = 0;
    const dispatch = createHandleDispatch({
      runId: "run-1",
      filePath: undefined,
      nowIso: () => "2026-09-23T12:00:00.000Z",
      isBlackBoxed: () => blackBoxed,
      takeSeq: () => (seq += 1),
      maxRecordedSeq: 0,
      recordedAt: () => undefined,
      resolvedFor: (id) => inMemory.get(id),
      writer: {
        append: () => {},
        appendResolved: (line) => lines.push(line),
        flush: async () => {},
        dispose: () => {},
      },
      setResolved: (entry) => inMemory.set(entry.correlationId, entry),
      suspension: createSuspensionLatch(),
    });
    const answer = async (_id: string, resolver: ReplyResolver) => resolver.resolve("ok");
    const live = await dispatch.send({ kind: "thread.turn", refId: "t", args: 1, fire: answer });
    blackBoxed = true;
    const boxed = await dispatch.send({ kind: "thread.turn", refId: "t", args: 2, fire: answer });

    expect(lines.map((line) => line.startedAt)).toEqual(["2026-09-23T12:00:00.000Z"]);
    expect(inMemory.get(live)?.startedAt).toBe("2026-09-23T12:00:00.000Z");
    expect(inMemory.get(boxed)?.reply).toBe("ok");
    expect(inMemory.get(boxed)?.startedAt).toBeUndefined(); // never journaled, so no time
    // The same run's in-memory entry and its replayed copy agree.
    const replayed = buildJournalMaps(lines.map(toResolvedWire)).byCorrelation.get(live);
    expect(replayed).toEqual(inMemory.get(live));
  });
});
