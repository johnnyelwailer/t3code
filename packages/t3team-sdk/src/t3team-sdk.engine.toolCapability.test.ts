/**
 * Tool-group call-site gating + nested-workflow capability intersection (Epic 25
 * §Capability gating / §Tools):
 *
 *   • "The ref's `group` is checked against `meta.capabilities` at the call site; missing
 *     capability → `PermissionDeniedError`" — positive (group declared as a plain group-id
 *     string AND as an inline ToolGroupRef literal) and negative (undeclared group throws
 *     at the call site, handler never runs).
 *   • "Nested workflows can declare a subset of the parent's capabilities but never a
 *     superset. The engine intersects at invocation." — a parent holding the child's
 *     capabilities runs it; a parent missing them fails the `workflow()` invocation.
 */

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  counters,
  demoScripts,
  demoTools,
  resetCounters,
  runsRoot,
  subParentNoCapsWorkflow,
  subParentWorkflow,
  toolGroupObjectCapWorkflow,
  toolNoCapabilityWorkflow,
  twoTools,
} from "./t3team-sdk.engineFixtures.ts";
import { PermissionDeniedError, startWorkflow } from "./t3team-sdk.index.ts";

beforeEach(() => {
  resetCounters();
});
afterAll(() => {
  cleanupRunsRoot();
});

describe("tools.* call-site capability gate", () => {
  it("allows tool calls whose group id is declared as a string in meta.capabilities", async () => {
    const { result } = await startWorkflow(
      twoTools,
      { prId: "pr-1" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true, mergedSha: "sha-pr-1" });
    expect(counters.approveCalls).toBe(1);
    expect(counters.mergeCalls).toBe(1);
  });

  it("allows tool calls whose group is declared as an inline ToolGroupRef literal", async () => {
    const { result } = await startWorkflow(
      toolGroupObjectCapWorkflow,
      { prId: "pr-2" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ approved: true });
    expect(counters.approveCalls).toBe(1);
  });

  it("throws PermissionDeniedError at the call site when the tool's group is not declared", async () => {
    const error = await startWorkflow(
      toolNoCapabilityWorkflow,
      { prId: "pr-3" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(String(error)).toMatch(/Tool 'demo\.approve' requires the 'demo\.read' tool-group/);
    // Gated at the call site — the handler (and its side effect) never ran.
    expect(counters.approveCalls).toBe(0);
  });
});

describe("nested-workflow capability intersection", () => {
  it("runs a child whose capabilities are a subset of the parent's", async () => {
    const { result } = await startWorkflow(
      subParentWorkflow,
      { name: "ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    );
    expect(result).toEqual({ greeting: "hi ada", upper: "HI ADA" });
    expect(counters.greetCalls).toBe(1);
  });

  it("fails the workflow() invocation when the child declares beyond the parent", async () => {
    const error = await startWorkflow(
      subParentNoCapsWorkflow,
      { name: "ada" },
      { runsRoot, tools: [], scripts: demoScripts },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(String(error)).toMatch(/declares capabilities its parent does not hold: 'script'/);
    expect(counters.greetCalls).toBe(0);
  });
});
