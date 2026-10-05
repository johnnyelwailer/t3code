/**
 * The bindings facet guards the exact incident shape: a value import from `@t3team/sdk` the engine
 * never binds. The positive assertions matter as much — every bound name and every type-only import
 * must stay silent, or valid bodies start failing validation.
 */
import { describe, expect, it } from "vite-plus/test";

import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
import { WORKFLOW_BOUND_GLOBAL_NAMES } from "./t3team-sdk.workflowBoundNames.ts";

const audit = (sourceText: string) =>
  auditWorkflowSourceStatic({ absolutePath: "/x/probe.workflow.ts", sourceText }).filter(
    (item) => item.facet === "bindings",
  );

describe("bindings audit facet", () => {
  it("derives the bound-name list from the loader surface (no literal to drift)", () => {
    expect(WORKFLOW_BOUND_GLOBAL_NAMES).toContain("agent");
    expect(WORKFLOW_BOUND_GLOBAL_NAMES).toContain("defineModel");
    expect(WORKFLOW_BOUND_GLOBAL_NAMES).toContain("waitUntil");
    expect(WORKFLOW_BOUND_GLOBAL_NAMES).toContain("getArgs");
    expect(new Set(WORKFLOW_BOUND_GLOBAL_NAMES).size).toBe(WORKFLOW_BOUND_GLOBAL_NAMES.length);
  });

  it("flags a value import from @t3team/sdk that is not bound, naming the bound set", () => {
    const findings = audit(
      [
        `import { agent, notARealEngineVerb } from "@t3team/sdk";`,
        `export const meta = { name: "probe" } as const;`,
        `export default async function run() { return notARealEngineVerb(agent); }`,
      ].join("\n"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rule).toBe("unbound-import");
    expect(findings[0]!.message).toContain("notARealEngineVerb");
    expect(findings[0]!.message).toContain("ReferenceError");
    expect(findings[0]!.message).toContain("agent");
  });

  it("flags default and namespace imports of the engine API", () => {
    const findings = audit(
      [
        `import sdk, * as api from "@t3team/sdk";`,
        `export const meta = { name: "probe" } as const;`,
        `export default async function run() { return [sdk, api]; }`,
      ].join("\n"),
    );
    expect(findings.map((item) => item.rule)).toEqual(["unbound-import", "unbound-import"]);
  });

  it("stays silent for bound names, aliased bound names and type-only imports", () => {
    const findings = audit(
      [
        `import { agent as ask, phase, type AgentOpts } from "@t3team/sdk";`,
        `import type { Thread } from "@t3team/sdk";`,
        `export const meta = { name: "probe" } as const;`,
        `export default async function run() { phase("x"); return ask("p", { capabilities: "inherit" }); }`,
      ].join("\n"),
    );
    expect(findings).toEqual([]);
  });
});
