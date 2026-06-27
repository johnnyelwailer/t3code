/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Composition-primitive tests. Each primitive gets a round-trip (run → resume returns the
 * recorded result, the tool/script/sleep/sub does NOT re-fire) and, where it journals, a drift
 * check (tamper the journal → loud ReplayDriftError). The budget reader and the wait-remainder
 * resume path get dedicated cases. (The LLM verb `agent` is exercised in the Thread-model
 * test, where it routes through the broker.)
 */

import * as NodeFS from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  budgetWorkflow,
  cleanupRunsRoot,
  counters,
  demoScripts,
  demoTools,
  parallelWorkflow,
  pipelineWorkflow,
  resetCounters,
  runsRoot,
  subParentWorkflow,
  waitWorkflow,
} from "./t3work-sdk.engineFixtures.ts";
import {
  ReplayDriftError,
  resumeWorkflow,
  startWorkflow,
  type SuspendedResult,
  type WorkflowRunResult,
} from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";

const base = { runsRoot, tools: demoTools, scripts: demoScripts } as const;

/** Assert a run completed (these fixtures never suspend) and narrow to the result shape. */
function completed<O>(result: WorkflowRunResult<O> | SuspendedResult): WorkflowRunResult<O> {
  if ("suspended" in result) throw new Error("expected a completed run, got a SuspendedResult");
  return result;
}

/** Rewrite one journal line (matched by seq) via a mutator, preserving the rest. */
function patchJournalLine(
  file: string,
  seq: number,
  mutate: (entry: Record<string, unknown>) => void,
): void {
  const lines = NodeFS.readFileSync(file, "utf8").trim().split("\n");
  const index = lines.findIndex((line) => (JSON.parse(line) as { seq: number }).seq === seq);
  const entry = JSON.parse(lines[index] ?? "{}") as Record<string, unknown>;
  mutate(entry);
  lines[index] = JSON.stringify(entry);
  NodeFS.writeFileSync(file, `${lines.join("\n")}\n`);
}

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("durable workflow engine — composition primitives", () => {
  it("black-boxes parallel thunks into one entry; failing thunk → null; no re-fire on resume", async () => {
    const { runId, result } = completed(await startWorkflow(parallelWorkflow, {}, base));
    expect(result).toEqual({ results: ["r1", null, "r3"] });
    expect(counters.noopCalls).toBe(2); // p1 + p3; the throwing thunk never calls the tool
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(1);
    expect(journal.get(1)).toMatchObject({ kind: "parallel", refId: "parallel" });
    const resumed = completed(await resumeWorkflow(runId, parallelWorkflow, {}, base));
    expect(resumed.result).toEqual(result);
    expect(counters.noopCalls).toBe(2);
  });

  it("black-boxes a two-stage pipeline into one entry and replays it", async () => {
    const { runId, result } = completed(
      await startWorkflow(pipelineWorkflow, { labels: ["x", "y"] }, base),
    );
    expect(result).toEqual({ out: ["ex!", "ey!"] });
    expect(counters.noopCalls).toBe(2);
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(1);
    expect(journal.get(1)).toMatchObject({ kind: "pipeline", refId: "pipeline" });
    const resumed = completed(
      await resumeWorkflow(runId, pipelineWorkflow, { labels: ["x", "y"] }, base),
    );
    expect(resumed.result).toEqual(result);
    expect(counters.noopCalls).toBe(2);
  });

  it("runs a sub-workflow as one entry; the child does not re-execute on resume", async () => {
    const { runId, result } = completed(
      await startWorkflow(subParentWorkflow, { name: "sub" }, base),
    );
    expect(result).toEqual({ greeting: "hi sub", upper: "HI SUB" });
    expect(counters.greetCalls).toBe(1); // the child's script call ran once, black-boxed
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(1);
    expect(journal.get(1)).toMatchObject({ kind: "workflow", refId: "workflow" });
    const resumed = completed(
      await resumeWorkflow(runId, subParentWorkflow, { name: "sub" }, base),
    );
    expect(resumed.result).toEqual(result);
    expect(counters.greetCalls).toBe(1); // child not re-run
  });

  it("exposes budget.total / spent() / remaining() and replays the same readings", async () => {
    const opts = { ...base, budget: 100 };
    const { runId, result } = completed(await startWorkflow(budgetWorkflow, {}, opts));
    expect(result).toEqual({ total: 100, spent: 0, remaining: 100 });
    const resumed = completed(await resumeWorkflow(runId, budgetWorkflow, {}, opts));
    expect(resumed.result).toEqual(result);
  });

  it("wait records a deadline, sleeps once on the original run, and replays instantly", async () => {
    const ms = 60;
    const t0 = Date.now();
    const { runId, result } = completed(await startWorkflow(waitWorkflow, { ms }, base));
    expect(result).toEqual({ done: true });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(ms - 20); // slept ~ms on the live run
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.get(1)).toMatchObject({ kind: "wait", refId: "wait" });
    const waitResult = journal.get(1)?.result as { deadline?: unknown } | undefined;
    expect(typeof waitResult?.deadline).toBe("number");
    const t1 = Date.now();
    const resumed = completed(await resumeWorkflow(runId, waitWorkflow, { ms }, base));
    expect(resumed.result).toEqual({ done: true });
    expect(Date.now() - t1).toBeLessThan(ms); // deadline already passed → no sleep
  });

  it("wait sleeps the remainder on resume when the deadline has not yet passed", async () => {
    const { runId } = completed(await startWorkflow(waitWorkflow, { ms: 20 }, base));
    const future = Date.now() + 250;
    patchJournalLine(journalFilePath(runsRoot, runId), 1, (e) => {
      e["result"] = { v: { deadline: future } };
    });
    const t0 = Date.now();
    await resumeWorkflow(runId, waitWorkflow, { ms: 20 }, base);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200); // slept the remaining ~250ms
  });

  it("raises ReplayDriftError when a recorded wait argsHash no longer matches", async () => {
    const { runId } = completed(await startWorkflow(waitWorkflow, { ms: 10 }, base));
    patchJournalLine(journalFilePath(runsRoot, runId), 1, (e) => {
      e["argsHash"] = "f".repeat(64);
    });
    const error = await resumeWorkflow(runId, waitWorkflow, { ms: 10 }, base).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ReplayDriftError);
    expect((error as ReplayDriftError).seq).toBe(1);
  });
});
