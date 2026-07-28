/**
 * The `"types"` facet — the half of "an invalid workflow fails at typecheck" that no AST scan and no
 * runtime throw can provide.
 *
 * The cases that matter are about a workflow OUTSIDE any install: the paths below are under
 * `/tmp/…/.t3team/recipes/…`, deliberately mimicking a real scaffolded workspace with no tsconfig
 * and no `node_modules` up its tree. That is the configuration in which every type used to widen to
 * `any` while the checker reported success.
 */

import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";
import { typeCheckWorkflowSource } from "./t3team-sdk.typeCheck.ts";
import {
  defaultAnchorPath,
  getTypeCheckHost,
  resetTypeCheckHosts,
} from "./t3team-sdk.typeCheckHost.ts";

/** A path shaped like a real authored recipe, in a directory that resolves nothing on its own. */
const workspaceFile = (name: string): string =>
  NodePath.join(
    NodeOS.tmpdir(),
    "t3team-typecheck-spec",
    ".t3team",
    "recipes",
    name,
    "workflow.ts",
  );

const CLEAN = `import { Schema } from "effect";
import { agent, getArgs } from "@t3team/sdk";

export const Inputs = Schema.Struct({ topic: Schema.String });
export const meta = { name: "spec.clean", inputs: Inputs } as const;

export default async function run() {
  const input = Schema.decodeUnknownSync(Inputs)(getArgs());
  const summary = await agent(\`summarize \${input.topic}\`, { capabilities: "inherit" });
  return { summary };
}
`;

beforeAll(resetTypeCheckHosts);
afterAll(resetTypeCheckHosts);

describe("workflow type checking", () => {
  it("reports nothing for a workflow that is actually correct", () => {
    const findings = typeCheckWorkflowSource({
      absolutePath: workspaceFile("clean"),
      sourceText: CLEAN,
    });
    expect(findings).toEqual([]);
  });

  // The whole point of the required-`capabilities` work: this is the diagnostic that was invisible.
  it("catches a subagent spawned without capabilities, naming the line", () => {
    const source = CLEAN.replace(', { capabilities: "inherit" }', "");
    const findings = typeCheckWorkflowSource({
      absolutePath: workspaceFile("missing-caps"),
      sourceText: source,
    });
    expect(findings.length).toBeGreaterThan(0);
    const [first] = findings;
    expect(first?.facet).toBe("types");
    expect(first?.line).toBe(9);
    expect(first?.rule).toMatch(/^ts\d+$/);
  });

  it("catches a misspelled capability, which used to be an untyped string", () => {
    const source = CLEAN.replace('"inherit"', '["integraton.read"]');
    const findings = typeCheckWorkflowSource({
      absolutePath: workspaceFile("typo-caps"),
      sourceText: source,
    });
    expect(findings.some((f) => f.facet === "types" && f.line === 9)).toBe(true);
  });

  it("catches a wrong argument type", () => {
    const source = CLEAN.replace("await agent(`summarize ${input.topic}`", "await agent(42");
    const findings = typeCheckWorkflowSource({
      absolutePath: workspaceFile("wrong-arg"),
      sourceText: source,
    });
    expect(findings.some((f) => f.rule === "ts2345")).toBe(true);
  });

  // The loader blanks imports and binds the verbs from the run, so a body is checked AS AUTHORED.
  // An import that will be erased must never be reported as unused.
  it("does not report an erased or unused import as a problem", () => {
    const source = `import { log, phase } from "@t3team/sdk";

export const meta = { name: "spec.unused" } as const;

export default async function run() {
  phase("only one of the two imports is used");
  return {};
}
`;
    const findings = typeCheckWorkflowSource({
      absolutePath: workspaceFile("unused-import"),
      sourceText: source,
    });
    expect(findings).toEqual([]);
  });

  // A packed server may ship no `.d.ts` for the authoring packages. The one thing we must never do
  // is build a program in which every SDK type is `any` and report the workflow as clean.
  it("degrades to a single explanatory finding when the authoring types do not resolve", () => {
    const findings = typeCheckWorkflowSource(
      { absolutePath: workspaceFile("degraded"), sourceText: CLEAN },
      { anchorPath: NodePath.join(NodeOS.tmpdir(), "t3team-no-install", "anchor.ts") },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.facet).toBe("types");
    expect(findings[0]?.rule).toBe("typecheck-unavailable");
    expect(findings[0]?.message).toMatch(/could not be resolved/);
    expect(findings[0]?.message).toMatch(/environment problem/);
  });

  it("keeps the AST facets running when the type facet is degraded", () => {
    const findings = auditWorkflowSourceStatic(
      {
        absolutePath: workspaceFile("degraded-ast"),
        sourceText: `export const meta = { name: "spec.ast", capabilities: [] } as const;

export default async function run() {
  const t = getThread();
  await t.askUser("Approve?");
  return {};
}
`,
      },
      {
        typecheck: true,
        typecheckAnchorPath: NodePath.join(NodeOS.tmpdir(), "t3team-no-install", "anchor.ts"),
      },
    );
    // Both facets present: the capability scan still flagged the undeclared `askUser`.
    expect(findings.some((f) => f.facet === "capability")).toBe(true);
    expect(findings.filter((f) => f.facet === "types")).toHaveLength(1);
  });

  // Behavioural, not timing-based: the lib + `effect` declaration graph is parsed once and reused.
  it("reuses the parsed dependency graph across validates", () => {
    resetTypeCheckHosts();
    const path = workspaceFile("cached");
    typeCheckWorkflowSource({ absolutePath: path, sourceText: CLEAN });
    const afterFirst = { ...getTypeCheckHost(defaultAnchorPath()).stats };
    typeCheckWorkflowSource({ absolutePath: path, sourceText: CLEAN });
    const afterSecond = { ...getTypeCheckHost(defaultAnchorPath()).stats };

    expect(afterFirst.parsed).toBeGreaterThan(50); // the lib + effect graph really is large
    expect(afterSecond.programs).toBe(2);
    // The second validate parsed (almost) nothing new and served the graph from cache.
    expect(afterSecond.parsed - afterFirst.parsed).toBeLessThan(5);
    expect(afterSecond.cacheHits).toBeGreaterThan(afterFirst.cacheHits);
  });

  it("reparses when the body text changes, so a cached result is never stale", () => {
    const path = workspaceFile("edited");
    expect(typeCheckWorkflowSource({ absolutePath: path, sourceText: CLEAN })).toEqual([]);
    const broken = CLEAN.replace(', { capabilities: "inherit" }', "");
    expect(
      typeCheckWorkflowSource({ absolutePath: path, sourceText: broken }).length,
    ).toBeGreaterThan(0);
  });
});
