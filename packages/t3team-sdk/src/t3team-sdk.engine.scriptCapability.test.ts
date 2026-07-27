/**
 * The `"script"` engine capability gates whether the `scripts.*` global tree is bound AT ALL
 * (Epic 25 §Scripts). It does not gate which scripts are callable — that is limited by the
 * launching recipe's registration (the run options' `scripts` record). The positive path —
 * a `capabilities: ["script"]` body calling registered scripts — is covered by the journal
 * and replay suites; this file pins the gate itself.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  counters,
  demoScripts,
  resetCounters,
  runsRoot,
  scriptNoCapabilityWorkflow,
  scriptWorkflow,
} from "./t3team-sdk.engineFixtures.ts";
import { startWorkflow } from "./t3team-sdk.index.ts";

beforeEach(() => {
  resetCounters();
});
afterAll(() => {
  cleanupRunsRoot();
});

describe("engine 'script' capability gate", () => {
  it("binds scripts.* when meta.capabilities includes 'script'", async () => {
    const { result } = await startWorkflow(
      scriptWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(result).toEqual({ greeting: "hi Ada", ticket: "ticket-1" });
    expect(counters.greetCalls).toBe(1);
  });

  it("leaves scripts.* unbound without the 'script' capability, even with scripts registered", async () => {
    const error = await startWorkflow(
      scriptNoCapabilityWorkflow,
      { name: "Ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    ).catch((e: unknown) => e);
    // The TypeError is constructed by the vm realm's intrinsics (not the injected host Error
    // chain), so assert on the rendered message rather than a host `instanceof Error`.
    expect(String(error)).toMatch(/scripts\.greet is not a function/);
    expect(counters.greetCalls).toBe(0);
  });
});
