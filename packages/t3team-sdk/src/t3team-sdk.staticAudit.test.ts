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
// the same). Without this, `tools.t3team.orchestration.run` is an unknown id and stays silent.
import "./tools/t3team-sdk.workflow.ts";

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

  it("gates an imported launchThread on the launch capability", () => {
    const sourceText = (capabilities: string) =>
      [
        'import { launchThread } from "@t3team/sdk";',
        `export const meta = { name: 'inline', capabilities: [${capabilities}] } as const;`,
        "export default async function run() {",
        "  await launchThread({ key: 'k', title: 't' });",
        "}",
      ].join("\n");
    const absolutePath = NodePath.join(FIXTURES, "inline.workflow.ts");
    const missing = auditWorkflowSourceStatic(
      { absolutePath, sourceText: sourceText("") },
      { declared: new Set() },
    );
    expect(missing.map((item) => [item.rule, item.construct])).toEqual([
      ["missing-capability", "launchThread({ key: 'k', title: 't' })"],
    ]);
    expect(missing[0]?.message).toContain("'launch'");
    expect(
      auditWorkflowSourceStatic(
        { absolutePath, sourceText: sourceText("'launch'") },
        { declared: new Set(["launch"]) },
      ),
    ).toEqual([]);
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
        "const out = await tools.t3team.orchestration.run({ source: 'x' });",
        "return { out };",
      ].join("\n"),
    };
    const findings = auditWorkflowSourceStatic(source, { declared: new Set() });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("'t3team.thread.write'");
    expect(findings[0]?.construct).toBe("tools.t3team.orchestration.run");
  });

  it("gates thread.showView on ui.render", () => {
    const source = {
      absolutePath: NodePath.join(FIXTURES, "inline.workflow.ts"),
      sourceText: [
        "export const meta = { name: 'inline', capabilities: ['user'] };",
        "getThread()?.showView({ key: 'k', viewId: 'notes.card', props: {} });",
        "return {};",
      ].join("\n"),
    };
    const findings = auditWorkflowSourceStatic(source, { declared: new Set(["user"]) });
    expect(findings.map((item) => item.message)).toEqual([expect.stringContaining("'ui.render'")]);
    expect(auditWorkflowSourceStatic(source, { declared: new Set(["ui.render"]) })).toEqual([]);
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

/**
 * Now that bodies import their verbs, the capability scan resolves by BINDING. A bare-name scan let
 * an aliased import walk straight past the static gate — the runtime gate would still have caught it,
 * but the point of the static check is to tell the author BEFORE the run.
 */
describe("capability check resolves imported bindings", () => {
  const audit = (lines: ReadonlyArray<string>) =>
    auditWorkflowSourceStatic(
      { absolutePath: "/virtual/binding.workflow.ts", sourceText: lines.join("\n") },
      { declared: new Set<string>() },
    );

  it("gates an aliased waitUntil import", () => {
    const findings = audit([
      `import { waitUntil as at } from "@t3team/sdk";`,
      `export const meta = { name: "x.alias", description: "d" } as const;`,
      `export default async function run() {`,
      `  await at(1000);`,
      `}`,
    ]);

    // The capability facet still sees through the alias (gates `at` as waitUntil); the bindings
    // facet additionally rejects the alias itself — the loader erases imports, so `at` would be
    // undefined at runtime regardless of the capability.
    const capability = findings.filter((item) => item.facet === "capability");
    expect(capability).toHaveLength(1);
    expect(capability[0]?.rule).toBe("missing-capability");
    expect(capability[0]?.message).toContain("'schedule'");
    expect(findings.filter((item) => item.facet === "bindings").map((item) => item.rule)).toEqual([
      "aliased-import",
    ]);
  });

  it("gates an author-named scripts tree", () => {
    const findings = audit([
      `import { getScripts } from "@t3team/sdk";`,
      `export const meta = { name: "x.scripts", description: "d" } as const;`,
      `export default async function run() {`,
      `  const s = getScripts();`,
      `  await s.computeStats({});`,
      `}`,
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("'script'");
  });

  // The mirror case: a local that merely shares a verb's name is not a capability use.
  it("does not gate a local that shadows a verb name", () => {
    const findings = audit([
      `import { agent } from "@t3team/sdk";`,
      `export const meta = { name: "x.shadow", description: "d" } as const;`,
      `export default async function run() {`,
      `  const waitUntil = makeTimer();`,
      `  await waitUntil(5);`,
      `  await agent("go");`,
      `}`,
    ]);

    expect(findings).toEqual([]);
  });
});

/**
 * The import rule reads opposite verdicts for the two body shapes, so both directions are pinned:
 * an ESM body is imported for real (engine API allowed), a legacy vm body has every import blanked
 * (the same line leaves the binding `undefined` at run time).
 */
describe("runtime-import rule is body-shape aware", () => {
  const audit = (lines: ReadonlyArray<string>) =>
    auditWorkflowSourceStatic(
      { absolutePath: "/virtual/shape.workflow.ts", sourceText: lines.join("\n") },
      { declared: new Set(["user"]) },
    );

  it("allows the engine API in an ESM body but still flags any other runtime import", () => {
    const findings = audit([
      `import { agent, phase } from "@t3team/sdk";`,
      `import * as NodeFS from "node:fs";`,
      `export const meta = { name: "x.esm", description: "d" } as const;`,
      `export default async function run() {`,
      `  phase("Go");`,
      `  await agent("go");`,
      `}`,
    ]);

    expect(findings.map((entry) => entry.rule)).toEqual(["runtime-import"]);
    expect(findings[0]?.message).toContain("`script` module");
  });

  it("still flags an engine-API import in a legacy vm-shaped body", () => {
    const findings = audit([
      `import { agent } from "@t3team/sdk";`,
      `export const meta = { name: "x.legacy", description: "d" } as const;`,
      `await agent("go");`,
    ]);

    expect(findings.map((entry) => entry.rule)).toEqual(["runtime-import"]);
    expect(findings[0]?.message).toContain("blanks every import");
  });
});

describe("composition options in static scans", () => {
  const source = (concurrency: string) => ({
    absolutePath: "/virtual/concurrency.workflow.ts",
    sourceText: `import { parallel, pipeline, waitUntil } from "@t3team/sdk";
export const meta = { name: "bounded", description: "Bounded work", capabilities: [] } as const;
export default async function run() {
  await parallel([async () => 1], { concurrency: ${concurrency} });
  return await pipeline([1, 2], async (prev) => prev, { concurrency: 2 });
}`,
  });

  it("accepts both options signatures without extra capabilities", () => {
    expect(auditWorkflowSourceStatic(source("2"), { declared: new Set() })).toEqual([]);
  });

  it("typechecks sync and async pipeline stages with explicit input types", () => {
    const typed = source("2");
    typed.sourceText = typed.sourceText.replace(
      "async (prev) => prev",
      "(prev: number) => prev + 1, async (prev: number) => prev + 1",
    );
    expect(auditWorkflowSourceStatic(typed, { declared: new Set(), typecheck: true })).toEqual([]);
    // A cold typecheck parses the lib + effect declaration graph (~9s on CI runners).
  }, 60_000);

  it("still scans expressions inside the options object", () => {
    const findings = auditWorkflowSourceStatic(source("process.pid + await waitUntil(1)"), {
      declared: new Set(),
    });
    expect(findings.map((f) => f.rule).sort()).toEqual([
      "missing-capability",
      "unjournaled-host-global",
    ]);
  });
});
