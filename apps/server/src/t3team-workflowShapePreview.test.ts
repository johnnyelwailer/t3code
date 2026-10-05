/**
 * Launch-preview message builder for the play-as-shape view. `buildWorkflowShapePreviewMessage`
 * turns a `.workflow.ts` source into a system, user-visible message carrying the
 * `t3team.workflow.shape` view, tagged with the owning run. The shape derivation itself is covered
 * in the SDK's `deriveWorkflowShape` test.
 */

import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { buildWorkflowShapePreviewMessage } from "./t3team-workflowShapePreview.ts";
import type { WorkflowHostMessageInput } from "./t3team-workflowHostPort.ts";

const viewOf = (message: WorkflowHostMessageInput) => {
  const attachment = message.ext?.attachments?.[0];
  if (attachment?.kind !== "view") throw new Error("expected a view attachment");
  return attachment;
};

const SOURCE = [
  `export const meta = {`,
  `  name: "shape.demo",`,
  `  description: "Read an issue then ask the user.",`,
  `  phases: [{ title: "Look" }, { title: "Ask" }],`,
  `} as const;`,
  `phase("Look");`,
  `const issue = await tools.jira.issue.get({ id: "BUG-1" });`,
  `phase("Ask");`,
  `await thread.askUser("Proceed?");`,
].join("\n");

const baseInput = {
  threadId: "thread-1",
  workflowPath: "/abs/shape.demo.workflow.ts",
  runId: "run-1",
};

describe("buildWorkflowShapePreviewMessage", () => {
  it("builds a system message carrying the shape view", () => {
    const message = buildWorkflowShapePreviewMessage({ ...baseInput, sourceText: SOURCE });

    expect(message.role).toBe("system");
    expect(message.threadId).toBe("thread-1");
    // Run-stable message id: a re-emission for the same run replaces the plan card in place
    // (one card per run), it never appends a second "Plan:" card.
    expect(message.messageId).toBe("t3team-wf-shape:run-1");
    const reEmitted = buildWorkflowShapePreviewMessage({ ...baseInput, sourceText: SOURCE });
    expect(reEmitted.messageId).toBe("t3team-wf-shape:run-1");
    expect(message.ext?.visibleToUser).toBe(true);
    expect(message.ext?.author).toEqual({ kind: "system", workflowRunId: "run-1" });

    const attachment = viewOf(message);
    expect(attachment.miniappId).toBe(PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE);
    expect(attachment.props).toMatchObject({
      name: "shape.demo",
      description: "Read an issue then ask the user.",
      phases: [{ title: "Look" }, { title: "Ask" }],
      steps: [
        { phase: "Look", kind: "read", label: "jira.issue.get" },
        { phase: "Ask", kind: "ask", label: "Proceed?" },
      ],
      workflowRunId: "run-1",
    });
  });

  it("includes declared capabilities in the shape payload (pre-execution disclosure)", () => {
    const command = buildWorkflowShapePreviewMessage({
      ...baseInput,
      sourceText: [
        `export const meta = {`,
        `  name: "shape.gated",`,
        `  capabilities: ["user", "script"],`,
        `} as const;`,
        `await thread.askUser("Proceed?");`,
      ].join("\n"),
    });

    const attachment = viewOf(command);
    expect(attachment.props).toMatchObject({
      name: "shape.gated",
      capabilities: [
        { kind: "feature", id: "user" },
        { kind: "feature", id: "script" },
      ],
    });
  });

  it("omits the capabilities field entirely for a capability-less workflow", () => {
    const command = buildWorkflowShapePreviewMessage({ ...baseInput, sourceText: SOURCE });

    const attachment = viewOf(command);
    expect(attachment.props).not.toHaveProperty("capabilities");
  });

  it("keeps declared capabilities even when the shape falls back to the minimal card", () => {
    const command = buildWorkflowShapePreviewMessage({
      ...baseInput,
      sourceText: `export const meta = { name: "empty.gated", capabilities: ["schedule"] } as const;\nreturn 1;`,
    });

    const attachment = viewOf(command);
    expect(attachment.props).toMatchObject({
      phases: [],
      steps: [],
      capabilities: [{ kind: "feature", id: "schedule" }],
    });
  });

  it("falls back to a minimal shape (never null) for a source with no phases and no steps", () => {
    const command = buildWorkflowShapePreviewMessage({
      ...baseInput,
      sourceText: `export const meta = { name: "empty" } as const;\nreturn 1;`,
    });

    const attachment = viewOf(command);
    expect(attachment.props).toMatchObject({
      name: "shape.demo",
      phases: [],
      steps: [],
      workflowRunId: "run-1",
    });
  });

  it("falls back to a minimal shape (never null) when derivation throws", () => {
    const command = buildWorkflowShapePreviewMessage({
      ...baseInput,
      workflowPath: "/abs/broken-workflow.ts",
      sourceText: "export const meta = {{{ not valid typescript at all (((",
    });

    expect(command.text).toBe("Plan: broken-workflow");
    const attachment = viewOf(command);
    expect(attachment.props).toMatchObject({
      name: "broken-workflow",
      phases: [],
      steps: [],
      workflowRunId: "run-1",
    });
  });
});
