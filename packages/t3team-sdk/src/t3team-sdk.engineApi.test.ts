import { describe, expect, it } from "vite-plus/test";

import {
  agent,
  getArgs,
  getBudget,
  getScripts,
  getThread,
  phase,
  withBodyApi,
} from "./t3team-sdk.index.ts";

/**
 * The point of the imported API is that a body can `import { agent } from "@t3team/sdk"` and have it
 * resolve the ACTIVE run — no injected globals. These tests pin the resolution and, just as
 * importantly, the failure modes: an author who calls a verb outside a run, or reaches for a
 * capability-gated one they did not declare, gets a sentence that says which and why.
 */
const surface = () => ({
  args: { prTitle: "Add retry" },
  thread: { id: "thread-1" },
  budget: { total: 500_000 },
  scripts: { computeStats: () => "ran" },
  agent: (prompt: string) => Promise.resolve(`answered:${prompt}`),
  phase: (title: string) => {
    calls.push(title);
  },
});
let calls: string[] = [];

describe("imported engine API", () => {
  it("resolves verbs from the active run", async () => {
    calls = [];
    const result = await withBodyApi(surface(), async () => {
      phase("Review");
      return await agent("summarize", { capabilities: "inherit" });
    });
    expect(result).toBe("answered:summarize");
    expect(calls).toEqual(["Review"]);
  });

  it("reads per-run values through accessors", () => {
    withBodyApi(surface(), () => {
      expect(getArgs<{ prTitle: string }>().prTitle).toBe("Add retry");
      expect(getThread<{ id: string }>()?.id).toBe("thread-1");
      expect(getBudget<{ total: number }>().total).toBe(500_000);
    });
  });

  // Headless runs (cron/automation) have no launching chat, so this is the one accessor that
  // legitimately returns undefined instead of throwing.
  it("returns undefined for the thread in a headless run", () => {
    withBodyApi({ ...surface(), thread: undefined }, () => {
      expect(getThread()).toBeUndefined();
    });
  });

  // Synchronously, deliberately — even for the async verbs. Calling an engine verb outside a run is
  // a programming error, so it fails at the call site with a clean stack instead of becoming a
  // rejected promise someone has to trace back.
  it("names the verb when called outside a run", () => {
    expect(() => agent("summarize", { capabilities: "inherit" })).toThrow(
      /'agent' was called outside a workflow runtime/,
    );
    expect(() => getArgs()).toThrow(/'args' was called outside a workflow runtime/);
    expect(() => getThread()).toThrow(/'getThread' was called outside a workflow runtime/);
  });

  // `scripts` is bound only when the body declares the "script" capability, so an undeclared
  // capability must read as a capability problem rather than as a missing function.
  it("points at the capability when a gated member is absent", () => {
    withBodyApi({ ...surface(), scripts: undefined }, () => {
      expect(() => getScripts()).toThrow(/capability-gated/);
    });
  });
});
