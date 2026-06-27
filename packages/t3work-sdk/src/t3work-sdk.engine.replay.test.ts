/**
 * Replay-drift tests: per-call args drift, call-identity drift (insertion), input-boundary
 * drift at seq 0, replay:never marker round-trips, and gap-drift when a journaled seq is
 * missing on resume. The core engine and journal tests live in their own files.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import {
  cleanupRunsRoot,
  counters,
  demoScripts,
  demoTools,
  insertedWorkflow,
  neverMarkerBaseWorkflow,
  neverMarkerRemovedWorkflow,
  resetCounters,
  runsRoot,
  scriptWorkflow,
  twoTools,
} from "./t3work-sdk.engineFixtures.ts";
import { resumeWorkflow, startWorkflow, ReplayDriftError } from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("durable workflow engine — replay drift", () => {
  it("throws ReplayDriftError at the input boundary (seq 0) when resume args differ", async () => {
    const { runId } = await startWorkflow(
      twoTools,
      { prId: "PR-args-1" },
      { runsRoot, tools: demoTools },
    );
    const error = await resumeWorkflow(
      runId,
      twoTools,
      { prId: "PR-args-2" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayDriftError);
    const drift = error as ReplayDriftError;
    expect(drift.seq).toBe(0);
    expect(drift.reason).toBe("args");
    expect(drift.expected.argsHash).toBe(hashArgs({ prId: "PR-args-1" }).slice(0, 12));
    expect(drift.observed.argsHash).toBe(hashArgs({ prId: "PR-args-2" }).slice(0, 12));
    expect(drift.message).toContain("seq 0");
    expect(drift.filePath).toBe(twoTools.absolutePath);
    expect(drift.message).toContain(twoTools.absolutePath);
  });

  it("throws a per-call args ReplayDriftError when a recorded argsHash no longer matches", async () => {
    const { runId } = await startWorkflow(
      twoTools,
      { prId: "PR-tamper" },
      { runsRoot, tools: demoTools },
    );
    const file = journalFilePath(runsRoot, runId);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0] ?? "{}") as { argsHash: string };
    first.argsHash = "f".repeat(64);
    lines[0] = JSON.stringify(first);
    writeFileSync(file, `${lines.join("\n")}\n`);
    const error = await resumeWorkflow(
      runId,
      twoTools,
      { prId: "PR-tamper" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayDriftError);
    const drift = error as ReplayDriftError;
    expect(drift.seq).toBe(1);
    expect(drift.reason).toBe("args");
    expect(drift.message).toContain(twoTools.absolutePath);
  });

  it("throws ReplayDriftError when a call is inserted before an existing one", async () => {
    const { runId } = await startWorkflow(
      twoTools,
      { prId: "PR-insert" },
      { runsRoot, tools: demoTools },
    );
    const error = await resumeWorkflow(
      runId,
      insertedWorkflow,
      { prId: "PR-insert" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayDriftError);
    const drift = error as ReplayDriftError;
    expect(drift.seq).toBe(1);
    expect(drift.reason).toBe("call");
    expect(drift.expected.refId).toBe("demo.approve");
    expect(drift.observed.refId).toBe("demo.lint");
    expect(drift.message).toContain("changed identity");
  });

  it("journals normal scripts but re-runs replay:never scripts on resume", async () => {
    const { runId, result } = await startWorkflow(
      scriptWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(result).toEqual({ greeting: "hi Ada", ticket: "ticket-1" });
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(2);
    expect(journal.get(1)).toMatchObject({ seq: 1, kind: "script", refId: "greet" });
    expect(journal.get(2)).toMatchObject({ seq: 2, kind: "script-never", refId: "freshTicket" });
    expect(journal.get(2)?.result).toBeUndefined();
    const resumed = await resumeWorkflow(
      runId,
      scriptWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(resumed.result).toEqual({ greeting: "hi Ada", ticket: "ticket-2" });
    expect(readJournal(journalFilePath(runsRoot, runId)).size).toBe(2);
  });

  it("round-trips the script-never marker and drifts when the never-script is removed", async () => {
    const { runId, result } = await startWorkflow(
      neverMarkerBaseWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(result).toEqual({ greeting: "hi Ada", ticket: "ticket-1", farewell: "bye Ada" });
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(3);
    expect(journal.get(2)).toMatchObject({ kind: "script-never", refId: "freshTicket" });
    expect(journal.get(3)).toMatchObject({ kind: "script", refId: "farewell" });
    const error = await resumeWorkflow(
      runId,
      neverMarkerRemovedWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayDriftError);
    const drift = error as ReplayDriftError;
    expect(drift.seq).toBe(2);
    expect(drift.reason).toBe("call");
    expect(drift.expected.refId).toBe("freshTicket");
    expect(drift.observed.refId).toBe("farewell");
  });

  it("raises gap-drift ReplayDriftError when a journaled seq is missing on resume", async () => {
    const runId = "gap-drift";
    await startWorkflow(twoTools, { prId: "PR-gap" }, { runsRoot, tools: demoTools, runId });
    const file = journalFilePath(runsRoot, runId);
    const kept = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter((line) => (JSON.parse(line) as { seq: number }).seq !== 1);
    writeFileSync(file, `${kept.join("\n")}\n`);
    const error = await resumeWorkflow(
      runId,
      twoTools,
      { prId: "PR-gap" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReplayDriftError);
    const drift = error as ReplayDriftError;
    expect(drift.seq).toBe(1);
    expect(drift.expected.presence).toBe("gap");
    // mergeCalls stays at 1 because the gap caused a drift before seq 2 was reached.
    expect(counters.mergeCalls).toBe(1);
  });
});
