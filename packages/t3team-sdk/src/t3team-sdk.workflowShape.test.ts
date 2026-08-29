/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Static shape derivation (play-as-shape view). `deriveWorkflowShape` reads a `.workflow.ts`
 * and, WITHOUT executing the body, produces its phase strip (from `meta.phases`) plus an
 * ordered, kind-tagged step list (from a static AST scan of the post-`meta` body):
 *   • `tools.*.get` → read, `agent` → agent, `thread.askUser` → ask, `tools.*.merge` → act;
 *   • steps carry the `phase()` group they run under;
 *   • labels come from the prompt's first line / the tool path (best-effort).
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { deriveWorkflowShape } from "./t3team-sdk.index.ts";

function fixtureSource(relative: string) {
  const absolutePath = NodeURL.fileURLToPath(
    new URL(`./__fixtures__/${relative}`, import.meta.url),
  );
  return { absolutePath, sourceText: NodeFS.readFileSync(absolutePath, "utf8") };
}

describe("deriveWorkflowShape", () => {
  it("derives the phase strip + kind-tagged steps for a known workflow", () => {
    const shape = deriveWorkflowShape(fixtureSource("t3team-sdk.shape.workflow.ts"));

    expect(shape.name).toBe("shape.pr-review");
    expect(shape.description).toBe("Summarize a PR, then ask the user whether to merge it.");
    expect(shape.phases).toEqual([{ title: "Review" }, { title: "Decide" }]);
    expect(shape.steps).toEqual([
      { phase: "Review", kind: "read", label: "github.pullRequest.get" },
      { phase: "Review", kind: "agent", label: "Summarize the risk of:" },
      { phase: "Decide", kind: "ask", label: 'Merge ""?' },
      { phase: "Decide", kind: "act", label: "github.pullRequest.merge" },
    ]);
  });

  it("falls back to phase() titles when meta declares no phases", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/no-meta-phases.workflow.ts",
      sourceText: [
        `import { Schema } from "effect";`,
        `export const meta = { name: "x.no-phases", description: "d" } as const;`,
        `phase("Only");`,
        `await agent("do a thing");`,
        `await scripts.publishNotes({});`,
      ].join("\n"),
    });

    expect(shape.phases).toEqual([{ title: "Only" }]);
    expect(shape.steps).toEqual([
      { phase: "Only", kind: "agent", label: "do a thing" },
      { phase: "Only", kind: "act", label: "publishNotes" },
    ]);
  });

  it("uses explicit workflow labels instead of exposing full prompts", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/labels.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.labels" } as const;`,
        `await agent(dynamicPrompt, { label: "Review changes" });`,
        `await thread.askUser(dynamicQuestion, { label: "Approve release" });`,
      ].join("\n"),
    });

    expect(shape.steps).toEqual([
      { phase: null, kind: "agent", label: "Review changes" },
      { phase: null, kind: "ask", label: "Approve release" },
    ]);
  });

  it("keeps template source placeholders out of user-facing labels", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/template-label.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.template-label" } as const;`,
        "await agent(`Recurring health check cycle ${cycle}`);",
      ].join("\n"),
    });

    expect(shape.steps).toEqual([
      { phase: null, kind: "agent", label: "Recurring health check cycle" },
    ]);
  });

  it("tags steps before any phase() call with a null phase", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/no-phase.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.flat" } as const;`,
        `const r = await tools.jira.issue.search({});`,
        `await thread.askUser(prompt);`,
      ].join("\n"),
    });

    expect(shape.phases).toEqual([]);
    expect(shape.steps).toEqual([
      { phase: null, kind: "read", label: "jira.issue.search" },
      // a dynamic (non-literal) prompt falls back to the generic verb label
      { phase: null, kind: "ask", label: "Ask the user" },
    ]);
  });

  it("shows a workflow() sub-orchestration call site instead of dropping it from the preview", () => {
    // Matches the shipped `review-pipeline` recipe's real shape: a type argument on
    // `defineWorkflow` (`<typeof Scope>`) between the callee and its path-literal argument.
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/sub-workflow.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.sub-workflow" } as const;`,
        `phase("Umfang");`,
        `await workflow(defineWorkflow<typeof Scope>("./orchestrations/scope.ts"), {});`,
        `phase("Kontext");`,
        `await workflow(defineWorkflow<typeof Requirements>("./orchestrations/requirements.ts"), {});`,
      ].join("\n"),
    });

    expect(shape.steps).toEqual([
      { phase: "Umfang", kind: "act", label: "scope.ts" },
      { phase: "Kontext", kind: "act", label: "requirements.ts" },
    ]);
  });

  it("falls back to a generic label for a workflow() ref bound to a variable earlier in the body", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/sub-workflow-ref.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.sub-workflow-ref" } as const;`,
        `const scopeRef = defineWorkflow("./orchestrations/scope.ts");`,
        `phase("Umfang");`,
        `await workflow(scopeRef, {});`,
      ].join("\n"),
    });

    expect(shape.steps).toEqual([{ phase: "Umfang", kind: "act", label: "Run sub-workflow" }]);
  });

  it("shows durable wait()/waitUntil() calls so the runtime's wait.until step has a plan row to match", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/wait.workflow.ts",
      sourceText: [
        `export const meta = { name: "x.wait" } as const;`,
        `phase("Timer");`,
        `await wait(60_000);`,
        `await waitUntil(now() + 2 * 60 * 1000);`,
      ].join("\n"),
    });

    expect(shape.steps).toEqual([
      { phase: "Timer", kind: "act", label: "Pause" },
      { phase: "Timer", kind: "act", label: "Wait for scheduled time" },
    ]);
  });

  it("normalizes meta.capabilities for the pre-execution permission surface", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/capabilities.workflow.ts",
      sourceText: [
        `const releaseWrite = {`,
        `  kind: "tool-group",`,
        `  id: "release-notes.write",`,
        `  label: "Write release notes artifacts",`,
        `  description: "Create or update release notes content.",`,
        `} as const;`,
        `export const meta = {`,
        `  name: "x.capabilities",`,
        `  capabilities: ["user", "schedule", releaseWrite, 42, null],`,
        `} as const;`,
        `await thread.askUser("Proceed?");`,
      ].join("\n"),
    });

    // Strings → feature entries; tool-group refs carry their own label/description;
    // unrecognized entries are dropped — the preview never invents a permission.
    expect(shape.capabilities).toEqual([
      { kind: "feature", id: "user" },
      { kind: "feature", id: "schedule" },
      {
        kind: "tool-group",
        id: "release-notes.write",
        label: "Write release notes artifacts",
        description: "Create or update release notes content.",
      },
    ]);
  });

  it("yields an empty capability list for a workflow that declares none", () => {
    const shape = deriveWorkflowShape({
      absolutePath: "/virtual/no-capabilities.workflow.ts",
      sourceText: [`export const meta = { name: "x.none" } as const;`, `await agent("go");`].join(
        "\n",
      ),
    });

    expect(shape.capabilities).toEqual([]);
  });
});

/**
 * With bodies importing their verbs (Epic 25 §The engine API — imported, not injected), the scan
 * resolves by BINDING rather than by bare identifier. These two cases are exactly what the bare-name
 * scan got wrong, in both directions — and the third pins that legacy bodies are unaffected.
 */
describe("verb resolution by imported binding", () => {
  const META = `export const meta = { name: "x.binding", description: "d" } as const;`;
  const shapeOf = (lines: ReadonlyArray<string>) =>
    deriveWorkflowShape({
      absolutePath: "/virtual/binding.workflow.ts",
      sourceText: lines.join("\n"),
    });

  it("follows a renamed import and ignores a local that shadows a verb name", () => {
    const shape = shapeOf([
      `import { agent as ask, phase as step } from "@t3team/sdk";`,
      META,
      `export default async function run() {`,
      `  step("Review");`,
      `  await ask("Summarize the PR", { label: "Summarize" });`,
      `  const parallel = pickHelper();`,
      `  parallel("not an engine call");`,
      `}`,
    ]);

    expect(shape.phases).toEqual([{ title: "Review" }]);
    expect(shape.steps).toEqual([{ phase: "Review", kind: "agent", label: "Summarize" }]);
  });

  it("resolves a namespace import and an author-named scripts accessor", () => {
    const shape = shapeOf([
      `import * as sdk from "@t3team/sdk";`,
      META,
      `export default async function run() {`,
      `  sdk.phase("Compute");`,
      `  const s = sdk.getScripts();`,
      `  await s.computeStats({});`,
      `}`,
    ]);

    expect(shape.phases).toEqual([{ title: "Compute" }]);
    expect(shape.steps).toEqual([{ phase: "Compute", kind: "act", label: "computeStats" }]);
  });

  // A body with no SDK import has ambient verbs, so bare names must still be read as verbs.
  it("keeps reading bare identifiers in a legacy injected-globals body", () => {
    const shape = shapeOf([
      META,
      `phase("Legacy");`,
      `await agent("Do the thing", { label: "Do it" });`,
    ]);

    expect(shape.phases).toEqual([{ title: "Legacy" }]);
    expect(shape.steps).toEqual([{ phase: "Legacy", kind: "agent", label: "Do it" }]);
  });
});
