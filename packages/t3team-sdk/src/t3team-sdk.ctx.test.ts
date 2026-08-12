/**
 * The `run(ctx)` seam (PR4 of the runbook-loader-ctx design): a body declaring the extra
 * `ctx` parameter receives the `RunbookContext` subset the host can honestly provide, and a
 * body declaring zero parameters (every other fixture) keeps running exactly as before.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  counters,
  ctxToolWorkflow,
  demoTools,
  resetCounters,
  runsRoot,
  twoTools,
} from "./t3team-sdk.engineFixtures.ts";
import { startWorkflow } from "./t3team-sdk.index.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("run(ctx)", () => {
  it("a body that declares ctx calls a tool through ctx.tool(...)", async () => {
    const { result } = await startWorkflow(
      ctxToolWorkflow,
      { prId: "PR-ctx" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true });
    expect(counters.approveCalls).toBe(1);
  });

  it("a zero-parameter body still runs unchanged when ctx is passed", async () => {
    const { result } = await startWorkflow(
      twoTools,
      { prId: "PR-legacy" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true, mergedSha: "sha-PR-legacy" });
  });
});
