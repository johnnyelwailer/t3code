/**
 * Phase-25.5 load-time static audits. The load-bearing assertions are the NEGATIVE ones: the
 * ambient nondeterminism Epic 25 rule 1 explicitly allows (journaled `Date` / `Math.random` /
 * `crypto.randomUUID`) must stay clean, and the unconditionally-bound primitives must never be
 * reported as capability violations — a false positive here is worse than a miss.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
// Imported for its registration side effect: the default tool->group resolver reads the
// `defineTool` registry, which a module only joins when it is loaded (the server broker does
// the same). Without this, `tools.t3team.thread.rename` is an unknown id and stays silent.
import "./tools/t3team-sdk.t3team.ts";

const FIXTURES = NodePath.join(import.meta.dirname, "__fixtures__");

function auditFixture(name: string, declared?: ReadonlySet<string>) {
  const absolutePath = NodePath.join(FIXTURES, name);
  return auditWorkflowSourceStatic(
    { absolutePath, sourceText: NodeFS.readFileSync(absolutePath, "utf8") },
    declared === undefined ? {} : { declared },
  );
}

const rules = (findings: ReadonlyArray<{ readonly rule: string }>) =>
  findings.map((item) => item.rule);

describe("determinism scan", () => {
  const findings = auditFixture("t3team-sdk.determinismBad.workflow.ts");

  it("flags a non-type runtime import with its position", () => {
    const runtimeImports = findings.filter((item) => item.rule === "runtime-import");
    expect(runtimeImports).toHaveLength(1);
    expect(runtimeImports[0]?.construct).toContain("./not-a-type.ts");
    expect(runtimeImports[0]?.line).toBe(4);
    expect(runtimeImports[0]?.column).toBe(1);
    expect(runtimeImports[0]?.facet).toBe("determinism");
  });

  it("exempts the allowlisted `Schema` import the loader injects", () => {
    expect(findings.some((item) => item.construct.includes('from "effect"'))).toBe(false);
  });

  it("flags head-level mutable state", () => {
    const mutable = findings.filter((item) => item.rule === "module-mutable-state");
    expect(mutable).toHaveLength(1);
    expect(mutable[0]?.construct).toBe("let attempts = 0;");
  });

  it("flags each unbound nondeterministic host global once, with its fix", () => {
    const globals = findings.filter((item) => item.rule === "unjournaled-host-global");
    expect(globals.map((item) => item.construct).sort()).toEqual([
      "fetch",
      "process",
      "setTimeout",
    ]);
    expect(globals.find((item) => item.construct === "setTimeout")?.message).toContain("wait(ms)");
    expect(globals.find((item) => item.construct === "fetch")?.message).toContain("`script`");
  });

  it("leaves the journaled ambient globals alone (Epic 25 rule 1)", () => {
    const clean = auditFixture("t3team-sdk.determinismOk.workflow.ts");
    expect(rules(clean)).toEqual([]);
  });
});

describe("static capability check", () => {
  const findings = auditFixture("t3team-sdk.capabilityBad.workflow.ts");
  const messages = findings.map((item) => item.message);

  it("reports every gated verb the body calls without its capability", () => {
    expect(findings.every((item) => item.rule === "missing-capability")).toBe(true);
    expect(findings.every((item) => item.facet === "capability")).toBe(true);
    expect(messages.filter((message) => message.includes("'user'"))).toHaveLength(3);
    expect(messages.filter((message) => message.includes("'script'"))).toHaveLength(1);
    expect(messages.filter((message) => message.includes("'schedule'"))).toHaveLength(1);
  });

  it("names the offending construct and points at meta.capabilities", () => {
    const askUser = findings.find((item) => item.construct.includes("askUser"));
    expect(askUser?.message).toContain("meta.capabilities");
    expect(askUser?.message).toContain("PermissionDeniedError");
    expect(askUser?.line).toBeGreaterThan(0);
  });

  it("never flags unconditionally-bound primitives", () => {
    const constructs = findings.map((item) => item.construct).join(" ");
    for (const primitive of ["agent(", "workflow(", "defineWorkflow"]) {
      expect(constructs).not.toContain(primitive);
    }
  });

  it("is clean once the capabilities are declared", () => {
    expect(rules(auditFixture("t3team-sdk.capabilityOk.workflow.ts"))).toEqual([]);
  });

  it("honours an explicitly supplied declared set over meta", () => {
    const withUser = auditFixture(
      "t3team-sdk.capabilityBad.workflow.ts",
      new Set(["user", "script", "schedule"]),
    );
    expect(rules(withUser)).toEqual([]);
  });

  it("stays silent about a tools.* call whose group cannot be resolved", () => {
    const source = {
      absolutePath: NodePath.join(FIXTURES, "inline.workflow.ts"),
      sourceText: [
        "export const meta = { name: 'inline', capabilities: [] };",
        "const out = await tools.unknown.thing({});",
        "return { out };",
      ].join("\n"),
    };
    expect(auditWorkflowSourceStatic(source, { declared: new Set() })).toEqual([]);
  });

  it("flags a tools.* call whose resolved group is undeclared", () => {
    const source = {
      absolutePath: NodePath.join(FIXTURES, "inline.workflow.ts"),
      sourceText: [
        "export const meta = { name: 'inline', capabilities: [] };",
        "const out = await tools.t3team.thread.rename({ title: 'x' });",
        "return { out };",
      ].join("\n"),
    };
    const findings = auditWorkflowSourceStatic(source, { declared: new Set() });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("'t3team.thread.write'");
    expect(findings[0]?.construct).toBe("tools.t3team.thread.rename");
  });

  it("skips capability rules when the capability set is unknowable", () => {
    // No `meta` at all: prepareWorkflow throws, so the declared set stays undefined and only
    // determinism rules run. The validate path reports the meta failure separately.
    const source = {
      absolutePath: NodePath.join(FIXTURES, "inline.workflow.ts"),
      sourceText: "const answer = await thread.askUser('Approve?');\nreturn { answer };",
    };
    expect(auditWorkflowSourceStatic(source)).toEqual([]);
  });
});
