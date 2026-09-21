/**
 * `isT3TeamFullBleedWidgetRow` — the pure predicate the `MessagesTimeline` row wrapper and
 * `T3TeamSystemTimelineRow` both branch on to decide which rows span the full thread content
 * width. The contract: exactly the rows that `T3TeamSystemTimelineRow` renders as a
 * `T3TeamWidgetBlock` — the widget-only case and the trusted-historical-HTML case.
 */
import { MessageId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
} from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { isT3TeamFullBleedWidgetRow } from "./t3team-fullBleedWidgetRow";
import type { ChatMessage } from "~/types";

const CREATED_AT = "2026-09-20T00:00:00.000Z";

function buildMessage(
  id: string,
  text: string,
  t3teamExt?: ChatMessage["t3teamExt"],
): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text,
    streaming: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    turnId: null,
    ...(t3teamExt ? { t3teamExt } : {}),
  };
}

function widgetAttachment(widgetId = "widget-1") {
  return {
    kind: "widget" as const,
    widget: {
      widgetId,
      title: "q4_revenue_chart",
      format: "html" as const,
      html: "<div>chart</div>",
    },
  };
}

describe("isT3TeamFullBleedWidgetRow", () => {
  it("is true for a widget-only row (widget attachment, no text, nothing else)", () => {
    const message = buildMessage("message-widget-only", "", {
      visibleToUser: true,
      attachments: [widgetAttachment()],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(true);
  });

  it("is true with multiple widget attachments", () => {
    const message = buildMessage("message-widgets-multi", "", {
      visibleToUser: true,
      attachments: [widgetAttachment("widget-a"), widgetAttachment("widget-b")],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(true);
  });

  it("is false for a prose row", () => {
    expect(isT3TeamFullBleedWidgetRow(buildMessage("message-prose", "Just a note."))).toBe(false);
  });

  it("is false when a widget attachment is mixed with visible text", () => {
    const message = buildMessage("message-mixed", "Here is the chart:", {
      visibleToUser: true,
      attachments: [widgetAttachment()],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is true for a trusted historical-HTML system message", () => {
    const message = buildMessage("message-historical-html", "<div class='legacy-report'><p>done</p></div>", {
      author: { kind: "system", workflowRunId: "run-1" },
      visibleToUser: true,
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(true);
  });

  it("is true for a historical SVG body", () => {
    const message = buildMessage("message-historical-svg", "<svg viewBox='0 0 10 10'><rect/></svg>", {
      author: { kind: "system", workflowRunId: "run-1" },
      visibleToUser: true,
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(true);
  });

  it("is false for a system + workflowRunId message with plain-text body (a notification, not HTML)", () => {
    const message = buildMessage("message-plain-run", "The run finished.", {
      author: { kind: "system", workflowRunId: "run-1" },
      visibleToUser: true,
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is false when a workflow shape card owns the row", () => {
    const message = buildMessage("message-shape-widget", "", {
      visibleToUser: true,
      attachments: [
        widgetAttachment(),
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
          props: {
            name: "shape.x",
            description: "d",
            phases: [{ title: "P" }],
            steps: [],
            workflowRunId: "run-1",
          },
        },
      ],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is false when a workflow decision (askUser) card owns the row", () => {
    const question = "Ship it?";
    const message = buildMessage("message-decision-widget", question, {
      visibleToUser: true,
      attachments: [
        widgetAttachment(),
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
          props: {
            question,
            affordance: { kind: "choice", options: ["ship", "hold"] },
            correlationId: "run-1:1",
            workflowRunId: "run-1",
          },
        },
      ],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is false when a workflow card is attached alongside the widget", () => {
    const message = buildMessage("message-card-widget", "", {
      visibleToUser: true,
      attachments: [
        widgetAttachment(),
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
          props: {
            workflowRunId: "run-1",
            stepId: "step-1",
            phase: "presented",
            card: { kind: "checklist", id: "card-1", title: "Card" },
          },
        },
      ],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is false when a generic (non-widget, non-workflow) attachment is present", () => {
    const message = buildMessage("message-generic-widget", "", {
      visibleToUser: true,
      attachments: [
        widgetAttachment(),
        {
          kind: "file",
          file: { id: "blob-1", label: "notes.txt" },
        },
      ],
    });
    expect(isT3TeamFullBleedWidgetRow(message)).toBe(false);
  });

  it("is false for a message with no attachments and no text", () => {
    expect(isT3TeamFullBleedWidgetRow(buildMessage("message-empty", ""))).toBe(false);
  });
});
