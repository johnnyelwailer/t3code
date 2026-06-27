/**
 * Engine core tests: start/resume happy paths, start-vs-resume collision/missing safety.
 * Drift/journal/determinism tests live in their own split files for additive-guard LOC
 * compliance.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import {
  cleanupRunsRoot,
  counters,
  demoTools,
  resetCounters,
  runsRoot,
  twoTools,
} from "./t3work-sdk.engineFixtures.ts";
import {
  resumeWorkflow,
  startWorkflow,
  WorkflowError,
  WorkflowRunNotFoundError,
} from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("durable workflow engine — core", () => {
  it("first run executes end to end and journals every primitive call", async () => {
    const { runId, result } = await startWorkflow(
      twoTools,
      { prId: "PR-1" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true, mergedSha: "sha-PR-1" });
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(2);
    const first = journal.get(1);
    const second = journal.get(2);
    expect(first).toMatchObject({
      seq: 1,
      kind: "tool",
      refId: "demo.approve",
      callId: "1:tool:demo.approve",
      argsHash: hashArgs({ prId: "PR-1" }),
      result: { approved: true, approvalId: "approval-PR-1" },
    });
    expect(second).toMatchObject({
      seq: 2,
      kind: "tool",
      refId: "demo.merge",
      callId: "2:tool:demo.merge",
      argsHash: hashArgs({ prId: "PR-1", approvalId: "approval-PR-1" }),
      result: { sha: "sha-PR-1" },
    });
    expect(() => new Date(first?.startedAt ?? "").toISOString()).not.toThrow();
  });

  it("resume replays the journaled call without re-executing it, then runs the rest", async () => {
    counters.mergeShouldFail = true;
    const runId = `replay-${Date.now()}`;
    await expect(
      startWorkflow(twoTools, { prId: "PR-2" }, { runsRoot, tools: demoTools, runId }),
    ).rejects.toThrow("simulated merge failure");
    expect(readJournal(journalFilePath(runsRoot, runId)).size).toBe(1);
    counters.mergeShouldFail = false;
    const { result } = await resumeWorkflow(
      runId,
      twoTools,
      { prId: "PR-2" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true, mergedSha: "sha-PR-2" });
    expect(readJournal(journalFilePath(runsRoot, runId)).size).toBe(2);
  });

  it("startWorkflow refuses a runId that already has a journal, unless overwrite", async () => {
    const runId = "collision-fixed";
    await startWorkflow(twoTools, { prId: "PR-c1" }, { runsRoot, tools: demoTools, runId });
    const error = await startWorkflow(
      twoTools,
      { prId: "PR-c1" },
      {
        runsRoot,
        tools: demoTools,
        runId,
      },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkflowError);
    expect((error as WorkflowError).message).toContain(journalFilePath(runsRoot, runId));
    expect((error as WorkflowError).message).toContain("resumeWorkflow");
    const fresh = await startWorkflow(
      twoTools,
      { prId: "PR-c2" },
      {
        runsRoot,
        tools: demoTools,
        runId,
        overwrite: true,
      },
    );
    expect(fresh.result).toEqual({ approved: true, mergedSha: "sha-PR-c2" });
    expect(readJournal(journalFilePath(runsRoot, runId)).size).toBe(2);
  });

  it("resumeWorkflow throws WorkflowRunNotFoundError for a missing journal", async () => {
    const missingPath = journalFilePath(runsRoot, "never-started");
    const error = await resumeWorkflow(
      "never-started",
      twoTools,
      { prId: "PR-x" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkflowRunNotFoundError);
    expect((error as WorkflowRunNotFoundError).journalPath).toBe(missingPath);
    expect((error as WorkflowRunNotFoundError).message).toContain(missingPath);
  });
});
