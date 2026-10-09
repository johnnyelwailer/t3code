import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as NodeURL from "node:url";

import { cleanupRunsRoot, resetCounters, runsRoot } from "./t3team-sdk.engineFixtures.ts";
import { createMockBroker, defineWorkflow, startWorkflow } from "./t3team-sdk.index.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

const parent = defineWorkflow("./__fixtures__/t3team-sdk.callRef.workflow.ts");
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
});
