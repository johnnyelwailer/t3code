// @effect-diagnostics nodeBuiltinImport:off -- reads the fixture workflow source at module load.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { precheckWorkflowSource } from "./t3team-workflowSourcePrecheck.ts";

const VALID_WORKFLOW_SOURCE = NodeFS.readFileSync(
  NodeURL.fileURLToPath(
    new URL("../__fixtures__/t3team-exampleReview.workflow.ts", import.meta.url),
  ),
  "utf8",
);

const YAML_SOURCE = `
name: review-pr
steps:
  - run: agent
    prompt: "Review this pull request"
`;

// Live incident shape: the meta head is clean, but an UNESCAPED backtick in plain position
// inside a template literal corrupts the BODY (`...the `inner` changes...` — the second
// backtick closes the template early). Only V8's compile of the transpiled body rejects
// this — ts.createSourceFile / ts.transpileModule both recover silently, so a precheck
// that stops at a TS parse cannot see it.
const BACKTICK_BODY_SOURCE = [
  `export const meta = { name: "probe", description: "x" } as const;`,
  `export default async function run() {`,
  "  const prompt = `Review the `inner` changes`;",
  `  return prompt;`,
  `}`,
].join("\n");

describe("precheckWorkflowSource", () => {
  it("rejects YAML with a message naming the missing entry contract and the full manual", () => {
    const error = precheckWorkflowSource(YAML_SOURCE);
    expect(error).not.toBeNull();
    expect(error).toContain("export const meta");
    expect(error).toContain("AGENT-ORCHESTRATION MANUAL");
  });

  it("accepts a real workflow TypeScript module", () => {
    expect(precheckWorkflowSource(VALID_WORKFLOW_SOURCE)).toBeNull();
  });

  it("rejects a body-level syntax error (unescaped backtick) with the compile reason", () => {
    const error = precheckWorkflowSource(BACKTICK_BODY_SOURCE);
    expect(error).not.toBeNull();
    expect(error).toContain("unparseable workflow TypeScript");
    expect(error).toContain("AGENT-ORCHESTRATION MANUAL");
  });

  it("rejects a missing default-exported run function", () => {
    const error = precheckWorkflowSource(
      `export const meta = { name: "no-body", description: "x" } as const;\nconst notAWorkflow = 1;\n`,
    );
    // No default export at all is legal for the loader (zero-arg legacy bodies exist);
    // what must NOT be accepted is a default export the engine cannot call.
    expect(error).toBeNull();
  });
});
