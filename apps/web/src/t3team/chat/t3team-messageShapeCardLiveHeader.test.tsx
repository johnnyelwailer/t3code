// @vitest-environment jsdom
/**
 * Split out of `t3team-messageShapeCardLive.test.tsx` (which outgrew the test-file LOC ceiling)
 * once it needed a whole extra round of header/outcome presentation tests.
 *
 * Covers, in order:
 *   - Defect 3 headline: `meta.description` leads the card headline, `meta.name` demotes to a
 *     plain muted chip beside it.
 *   - Defect 3 outcome fold-in: the run's terminal message renders in full, in its own body, as
 *     markdown — the terminal banner may add only a short, honest, already-safe status line.
 *   - GHE (layout regression spotted live by PJ, the second merge blocker on top of the above):
 *     the header used to try one row for title + slug + live status, and PJ called it "an ux
 *     disaster" — the title clamped to two lines and still truncated, the slug interrupted it,
 *     and the status wrapped to three lines. Fixed as two rows: title alone, full width, on
 *     row 1; slug + status + controls, small and muted, on row 2.
 *
 * `t3team-messageShapeCardLive.testSupport.tsx` (imported below) carries the shared
 * `@legendapp/list/react` mock and `window.matchMedia` shim as module-level side effects — no
 * need to repeat them here.
 */
import { EventId, MessageId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
} from "@t3tools/project-recipes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { buildT3TeamMessagesTimelineTestProps } from "~/t3team/chat/t3team-messagesTimelineTestProps";
import type { ChatMessage } from "~/types";
import {
  countOccurrences,
  runActivity,
  RUN_ID,
  TEST_WORKFLOW_SHAPE,
} from "~/t3team/chat/t3team-messageShapeCardLive.testSupport";

describe("workflow card headline — description leads, slug demoted", () => {
  function shapeOnlyMessage(shapeOverrides?: { description?: string }): ChatMessage {
    return {
      id: MessageId.make("message-shape-headline-1"),
      role: "system",
      text: "Plan: qa-nested-result",
      streaming: false,
      createdAt: "2026-07-17T09:59:00.000Z",
      updatedAt: "2026-07-17T09:59:00.000Z",
      turnId: null,
      t3teamExt: {
        visibleToUser: true,
        attachments: [
          {
            kind: "view",
            miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
            props: {
              name: "qa-nested-result",
              ...(shapeOverrides?.description === undefined
                ? {}
                : { description: shapeOverrides.description }),
              phases: [],
              steps: [],
              workflowRunId: "run-headline-1",
            },
          },
        ],
      },
    };
  }

  async function renderShapeOnly(message: ChatMessage) {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    return renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3TeamMessagesTimelineTestProps()}
        timelineEntries={[
          { id: "timeline-0", kind: "message" as const, createdAt: message.createdAt, message },
        ]}
      />,
    );
  }

  it("renders the description as the headline and demotes the slug to a chip", async () => {
    const description = "returns a realistic nested result: a findings array of objects";
    const markup = await renderShapeOnly(shapeOnlyMessage({ description }));

    expect(markup).toContain(description);
    expect(markup).toContain("qa-nested-result");
    // the slug stays visible, copyable, and in its `title` — but as a demoted chip, not the
    // bold headline (the chip carries a distinct monospace class the old headline never had).
    expect(markup).toContain("font-mono");
    expect(markup).toContain('title="qa-nested-result"');
    // the chip is plain muted monospace text — no bordered/filled box giving it button-like
    // weight (PJ: "just a muted text without card bg would be fine").
    expect(markup).not.toContain("border-border/60");
    expect(markup).not.toContain("bg-muted/40");
  });

  it("clamps a long description to two lines instead of truncating it to an unreadable fragment", async () => {
    const description =
      "one thunk throws; parallel() must yield null for it and continue processing every other thunk in the batch without aborting the whole run";
    const markup = await renderShapeOnly(shapeOnlyMessage({ description }));

    // the FULL sentence is present in the markup — never cut down for display.
    expect(markup).toContain(description);
    // it clamps to two lines (bounded height) rather than a single truncated line — the old
    // single-line `truncate` class must be gone from the headline.
    expect(markup).toContain("line-clamp-2");
    expect(markup).not.toContain("min-w-0 truncate text-sm font-semibold");
  });

  it("falls back to the slug as the headline when no description is present", async () => {
    const markup = await renderShapeOnly(shapeOnlyMessage());

    expect(markup).toContain("qa-nested-result");
    // no chip renders alongside it — that would be a second, redundant showing of the same slug
    // once it is already the headline (the tooltip's own popup content is not present in static
    // SSR markup at all, so the trigger's visible text is the only occurrence here).
    expect(countOccurrences(markup, "qa-nested-result")).toBe(1);
    expect(markup).not.toContain("font-mono");
  });
});

describe("workflow card terminal outcome fold-in", () => {
  function resultMessage(text: string): ChatMessage {
    return {
      id: MessageId.make(`t3team-wf-result:${RUN_ID}`),
      role: "assistant",
      text,
      streaming: false,
      createdAt: "2026-07-17T10:06:00.000Z",
      updatedAt: "2026-07-17T10:06:00.000Z",
      turnId: null,
    };
  }

  async function renderShapeAndResult(
    activities: ReadonlyArray<OrchestrationThreadActivity>,
    outcome: ChatMessage,
  ) {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const shape: ChatMessage = {
      id: MessageId.make("message-shape-outcome-1"),
      role: "system",
      text: "Plan: shape.pr-review",
      streaming: false,
      createdAt: "2026-07-17T09:59:00.000Z",
      updatedAt: "2026-07-17T09:59:00.000Z",
      turnId: null,
      t3teamExt: {
        visibleToUser: true,
        attachments: [
          {
            kind: "view",
            miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
            props: TEST_WORKFLOW_SHAPE,
          },
        ],
      },
    };
    return renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3TeamMessagesTimelineTestProps()}
        threadActivities={activities}
        timelineEntries={[
          {
            id: "timeline-0",
            kind: "message" as const,
            createdAt: shape.createdAt,
            message: shape,
          },
          {
            id: "timeline-1",
            kind: "message" as const,
            createdAt: outcome.createdAt,
            message: outcome,
          },
        ]}
      />,
    );
  }

  it("adds a short, honest outcome to the banner when the result is already short and plain", async () => {
    const markup = await renderShapeAndResult(
      [runActivity("completed")],
      resultMessage("**Decision:** approved"),
    );

    expect(markup).toContain('data-run-status="completed"');
    expect(markup).toContain("data-run-outcome-summary");
    // the banner shows it as plain text (markdown syntax is not meaningful in a status line).
    expect(markup).toContain("Decision: approved");
    // the full terminal message still renders in its own body too, as PARSED markdown — the
    // banner ADDS to the status, it does not replace the message as the result's home.
    expect(markup).toContain("<strong>Decision:</strong> approved");
  });

  it("never squashes a long markdown result into the banner — it renders in full in the message body", async () => {
    const longMarkdown = [
      "## Summary of src/cart.ts",
      "",
      "`src/cart.ts` — 3 exports:",
      "",
      "- `Item` (type): a cart line",
      "- `Total` (function): computes tax",
      "- `applyDiscount` (function): mutates the cart in place",
    ].join("\n");
    const markup = await renderShapeAndResult(
      [runActivity("completed")],
      resultMessage(longMarkdown),
    );

    expect(markup).toContain('data-run-status="completed"');
    expect(markup).toContain("Run completed");
    // A document is not a status word: the banner never gets an outcome line for this.
    expect(markup).not.toContain("data-run-outcome-summary");
    // The content itself is not dropped — it renders, and as PARSED markdown (the raw "## "
    // heading marker is consumed by the renderer, not left as literal text; `Total` renders as
    // an inline-code element rather than backtick-quoted plain text).
    expect(markup).toContain("Summary of src/cart.ts");
    expect(markup).not.toContain("## Summary of src/cart.ts");
    expect(markup).toContain(">Total<");
    expect(markup).not.toContain("`Total`");
  });

  it("keeps a plain 'Run completed' banner when the run genuinely returned nothing readable", async () => {
    const markup = await renderShapeAndResult(
      [runActivity("completed")],
      resultMessage("Workflow completed."),
    );

    expect(markup).toContain('data-run-status="completed"');
    expect(markup).toContain("Run completed");
    // the generic placeholder is not repeated as a redundant second line.
    expect(markup).not.toContain("data-run-outcome-summary");
  });

  it("renders the completion message's own body regardless of shape-card presence", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const outcome = resultMessage("Findings: none, all clear.");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3TeamMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-0",
            kind: "message" as const,
            createdAt: outcome.createdAt,
            message: outcome,
          },
        ]}
      />,
    );

    expect(markup).toContain("Findings: none, all clear.");
  });
});

describe("live card header — two-row layout", () => {
  function shapeWithDescriptionMessage(): ChatMessage {
    return {
      id: MessageId.make("message-shape-header-1"),
      role: "system",
      text: "Plan: qa-ask-forms",
      streaming: false,
      createdAt: "2026-07-17T09:59:00.000Z",
      updatedAt: "2026-07-17T09:59:00.000Z",
      turnId: null,
      t3teamExt: {
        visibleToUser: true,
        attachments: [
          {
            kind: "view",
            miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
            props: {
              name: "qa-ask-forms",
              description: "three askUser shapes in sequence: boolean, literals, struct form",
              phases: [],
              steps: [{ phase: null, kind: "ask", label: "Ask something" }],
              workflowRunId: "run-header-1",
            },
          },
        ],
      },
    };
  }

  async function renderHeaderCard(activities: ReadonlyArray<OrchestrationThreadActivity>) {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const message = shapeWithDescriptionMessage();
    return renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3TeamMessagesTimelineTestProps()}
        threadActivities={activities}
        timelineEntries={[
          { id: "timeline-0", kind: "message" as const, createdAt: message.createdAt, message },
        ]}
      />,
    );
  }

  it("puts the title alone on row 1, and the slug + live status together on row 2", async () => {
    const markup = await renderHeaderCard([
      {
        id: EventId.make("activity-header-waiting"),
        tone: "info",
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "waiting",
        payload: {
          workflowRunId: "run-header-1",
          stepId: "run-header-1:1",
          stepKind: "user.input",
          phase: "waiting",
        },
        turnId: null,
        // A fresh timestamp so `liveRunLabel` computes "just now" — the exact case that must NOT
        // print "since just now" any more.
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(markup).toContain("three askUser shapes in sequence: boolean, literals, struct form");
    expect(markup).toContain("qa-ask-forms");
    expect(markup).toContain("Waiting for your answer");
    // the uninformative, width-wasting suffix is gone.
    expect(markup).not.toContain("since just now");
    expect(markup).not.toContain("Waiting for your answer since");
    // structural: the slug (a row-2 element) is not inside the title's own row — it shows up
    // strictly after the title's clamp/tooltip markup closes, not interleaved with it.
    const titleIndex = markup.indexOf("line-clamp-2");
    const chipIndex = markup.indexOf("font-mono");
    expect(titleIndex).toBeGreaterThan(-1);
    expect(chipIndex).toBeGreaterThan(titleIndex);
    // row 2 carries the narrow-container fallback (stack instead of squeeze) — proves the fix
    // uses the container-query infrastructure rather than a fixed one-row layout.
    expect(markup).toContain("@sm/workflow-live-card:flex-row");
  });

  it("keeps row 2 sensible once the run is terminal and both the status and controls are gone", async () => {
    const markup = await renderHeaderCard([
      {
        id: EventId.make("activity-header-completed"),
        tone: "info",
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "run completed",
        payload: {
          workflowRunId: "run-header-1",
          stepId: "run:run-header-1",
          stepKind: "run",
          phase: "completed",
        },
        turnId: null,
        createdAt: "2026-07-17T10:05:00.000Z",
      },
    ]);

    expect(markup).toContain("three askUser shapes in sequence: boolean, literals, struct form");
    // the slug still shows on row 2 even with no live status and no controls beside it.
    expect(markup).toContain("qa-ask-forms");
    expect(markup).not.toContain("data-run-live-status");
    expect(markup).toContain('data-run-status="completed"');
  });
});
