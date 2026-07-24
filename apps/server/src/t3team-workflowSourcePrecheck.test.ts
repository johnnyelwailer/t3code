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
});
