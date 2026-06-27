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

import { deriveWorkflowShape } from "./t3work-sdk.index.ts";

function fixtureSource(relative: string) {
  const absolutePath = NodeURL.fileURLToPath(
    new URL(`./__fixtures__/${relative}`, import.meta.url),
  );
  return { absolutePath, sourceText: NodeFS.readFileSync(absolutePath, "utf8") };
}

describe("deriveWorkflowShape", () => {
  it("derives the phase strip + kind-tagged steps for a known workflow", () => {
    const shape = deriveWorkflowShape(fixtureSource("t3work-sdk.shape.workflow.ts"));

    expect(shape.name).toBe("shape.pr-review");
    expect(shape.description).toBe("Summarize a PR, then ask the user whether to merge it.");
    expect(shape.phases).toEqual([{ title: "Review" }, { title: "Decide" }]);
    expect(shape.steps).toEqual([
      { phase: "Review", kind: "read", label: "github.pullRequest.get" },
      { phase: "Review", kind: "agent", label: "Summarize the risk of: ${pr.title}" },
      { phase: "Decide", kind: "ask", label: 'Merge "${pr.title}"? ${review.risk}' },
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
});
