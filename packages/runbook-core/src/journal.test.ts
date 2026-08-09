import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { FsJournalStore } from "./journalStore.ts";
import { type JournalEntry } from "./journalReader.ts";

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
});
