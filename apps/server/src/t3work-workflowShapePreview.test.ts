/**
 * Launch-preview command builder for the play-as-shape view. `buildWorkflowShapePreviewCommand`
 * turns a `.workflow.ts` source into a `thread.message.upsert` carrying the `t3work.workflow.shape`
 * view (a system, user-visible message tagged with the owning run), or null when there is nothing
 * to show. The shape derivation itself is covered in the SDK's `deriveWorkflowShape` test.
 */

import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { buildWorkflowShapePreviewCommand } from "./t3work-workflowShapePreview.ts";

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
  nowIso: "2026-06-14T00:00:00.000Z",
};

describe("buildWorkflowShapePreviewCommand", () => {
  it("builds a system message carrying the shape view", () => {
    const command = buildWorkflowShapePreviewCommand({ ...baseInput, sourceText: SOURCE });

    expect(command).not.toBeNull();
    if (command === null || command.type !== "thread.message.upsert") {
      throw new Error("expected a thread.message.upsert command");
    }
    expect(command.message.role).toBe("system");
    // Run-stable message id: a re-emission for the same run replaces the plan card in place
    // (one card per run), it never appends a second "Plan:" card.
    expect(String(command.message.messageId)).toBe("t3work-wf-shape:run-1");
    const reEmitted = buildWorkflowShapePreviewCommand({ ...baseInput, sourceText: SOURCE });
    if (reEmitted.type !== "thread.message.upsert") {
      throw new Error("expected a thread.message.upsert command");
    }
    expect(String(reEmitted.message.messageId)).toBe("t3work-wf-shape:run-1");
    expect(command.message.t3workExt?.visibleToUser).toBe(true);
    expect(command.message.t3workExt?.author).toEqual({ kind: "system", workflowRunId: "run-1" });

    const attachment = command.message.t3workExt?.attachments?.[0];
    expect(attachment?.kind).toBe("view");
    if (attachment?.kind !== "view") throw new Error("expected a view attachment");
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

  it("falls back to a minimal shape (never null) for a source with no phases and no steps", () => {
    const command = buildWorkflowShapePreviewCommand({
      ...baseInput,
      sourceText: `export const meta = { name: "empty" } as const;\nreturn 1;`,
    });

    expect(command).not.toBeNull();
    if (command.type !== "thread.message.upsert") {
      throw new Error("expected a thread.message.upsert command");
    }
    const attachment = command.message.t3workExt?.attachments?.[0];
    if (attachment?.kind !== "view") throw new Error("expected a view attachment");
    expect(attachment.props).toMatchObject({
      name: "shape.demo",
      phases: [],
      steps: [],
      workflowRunId: "run-1",
    });
  });

  it("falls back to a minimal shape (never null) when derivation throws", () => {
    const command = buildWorkflowShapePreviewCommand({
      ...baseInput,
      workflowPath: "/abs/broken-workflow.ts",
      sourceText: "export const meta = {{{ not valid typescript at all (((",
    });

    expect(command).not.toBeNull();
    if (command.type !== "thread.message.upsert") {
      throw new Error("expected a thread.message.upsert command");
    }
    expect(command.message.text).toBe("Plan: broken-workflow");
    const attachment = command.message.t3workExt?.attachments?.[0];
    if (attachment?.kind !== "view") throw new Error("expected a view attachment");
    expect(attachment.props).toMatchObject({
      name: "broken-workflow",
      phases: [],
      steps: [],
      workflowRunId: "run-1",
    });
  });
});
