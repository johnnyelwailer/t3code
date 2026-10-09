import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as NodeURL from "node:url";

import { WorkflowSuspended } from "@runbook/core/handles";
import * as Schema from "effect/Schema";

import { createCallRef } from "./t3team-sdk.callRef.ts";
import { cleanupRunsRoot, resetCounters, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import { createMockBroker, defineWorkflow, startWorkflow } from "./t3team-sdk.index.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const parent = defineWorkflow("./__fixtures__/t3team-sdk.callRef.workflow.ts");
const parks = NodeURL.fileURLToPath(
  new URL("./__fixtures__/t3team-sdk.callRefParks.workflow.ts", import.meta.url),
);
const child = NodeURL.fileURLToPath(
  new URL("./__fixtures__/t3team-sdk.callRefChild.workflow.ts", import.meta.url),
);

describe("callRef", () => {
  it("decodes a fitting answer and falls back, with a reason, on everything else", async () => {
    const run = await startWorkflow(
      parent,
      {
        ref: { kind: "workflow", absolutePath: child },
        script: { kind: "script", modulePath: "/x.ts" },
      },
      { runsRoot, tools: [], broker: createMockBroker(() => ({ kind: "defer" })) },
    );
    if ("suspended" in run) throw new Error("expected a completed run");
    const fallback = { mode: "manual", reason: "pack default" };
    expect(run.result).toMatchObject({
      fits: { mode: "auto", reason: "label" },
      misfit: fallback,
      scripted: fallback,
      none: fallback,
    });
    const reasons = (run.result as { reasons: string[] }).reasons;
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toContain("does not fit the slot's contract");
    expect(reasons[1]).toContain("script reference");
    expect(reasons[2]).toContain("no workflow or recipe-action reference");
  });

  it("lets a referenced workflow that parks park the run, instead of falling back", async () => {
    const run = await startWorkflow(
      parent,
      { ref: { kind: "workflow", absolutePath: parks }, script: undefined },
      {
        runsRoot,
        tools: [],
        broker: createMockBroker(() => ({ kind: "defer" })),
        launchThreadId: "t",
      },
    );
    expect("suspended" in run).toBe(true);
  });

  it("rethrows the engine's own signals without reporting a fallback", async () => {
    const reasons: string[] = [];
    const call = createCallRef(async () => {
      throw new WorkflowSuspended("run-1:3");
    });
    await expect(
      call(
        { kind: "workflow", absolutePath: "/x.workflow.ts" },
        {},
        {
          outputs: Schema.String,
          fallback: () => "fallback",
          onFallback: (reason) => reasons.push(reason),
        },
      ),
    ).rejects.toBeInstanceOf(WorkflowSuspended);
    expect(reasons).toEqual([]);
  });
});
