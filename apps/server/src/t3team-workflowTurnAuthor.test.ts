/**
 * The workflow prompt's attribution. The end-to-end proof (the author surviving the decider,
 * projection and client snapshot, and an ordinary user message carrying none) lives in
 * `t3team-workflowEngineTurnAnswer.integration.test.ts`; here we pin the label rules and that the
 * result actually decodes against the contract — a `label` that came out empty would fail decode on
 * an otherwise fine message.
 */

import { T3TeamMessageWorkflowAuthor } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { workflowTurnAuthor } from "./t3team-workflowTurnAuthor.ts";

const decode = Schema.decodeUnknownSync(T3TeamMessageWorkflowAuthor);

describe("workflow turn author", () => {
  it("summarises with the step's own label when the body supplied one", () => {
    const author = workflowTurnAuthor("run-1", "run-1:3", {
      label: "Rewrite the description of T3-42",
      prompt: "Rewrite the description of T3-42.\n\nCurrent description:\nRounding is wrong.",
    });
    expect(author).toEqual({
      kind: "workflow",
      workflowRunId: "run-1",
      stepId: "run-1:3",
      label: "Rewrite the description of T3-42",
    });
    expect(decode(author)).toEqual(author);
  });

  it("falls back to a one-line snippet of the prompt, never nine paragraphs", () => {
    const prompt = `${"Read the work item first. ".repeat(20)}\n\nThen reply.`;
    const author = workflowTurnAuthor("run-2", "run-2:1", { prompt });
    expect(author.label.length).toBeLessThanOrEqual(96);
    expect(author.label).not.toContain("\n");
    expect(author.label.endsWith("…")).toBe(true);
    expect(decode(author)).toEqual(author);
  });

  it("still decodes when a body supplied neither a label nor any prompt text", () => {
    const author = workflowTurnAuthor("run-3", "run-3:1", { label: "   ", prompt: "" });
    expect(author.label).toBe("Workflow instructions");
    expect(decode(author)).toEqual(author);
  });
});
