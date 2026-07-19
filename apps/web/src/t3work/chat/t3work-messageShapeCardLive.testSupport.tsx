import type { LegendListRef } from "@legendapp/list/react";
import { EventId, MessageId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
  type ProjectRecipeWorkflowStepActivityPayload,
} from "@t3tools/project-recipes";
import { type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vite-plus/test";

import { buildT3workMessagesTimelineTestProps } from "~/t3work/chat/t3work-messagesTimelineTestProps";
import type { ChatMessage } from "~/types";

vi.mock("@legendapp/list/react", async () => ({
  LegendList: (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div>
      {props.ListHeaderComponent}
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
      {props.ListFooterComponent}
    </div>
  ),
}));

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

export const RUN_ID = "run-1";

export function stepActivity(
  payload: ProjectRecipeWorkflowStepActivityPayload,
  overrides?: { createdAt?: string; sequence?: number },
): OrchestrationThreadActivity {
  return {
    id: EventId.make(`t3work-wf-step:${payload.stepId}`),
    tone: payload.phase === "failed" ? "error" : "info",
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: `Workflow step ${payload.phase}: ${payload.detail ?? payload.stepKind}`,
    payload,
    turnId: null,
    createdAt: overrides?.createdAt ?? "2026-07-17T10:00:00.000Z",
    ...(overrides?.sequence === undefined ? {} : { sequence: overrides.sequence }),
  };
}

export function step(
  seq: number,
  stepKind: string,
  phase: ProjectRecipeWorkflowStepActivityPayload["phase"],
  extra?: { detail?: string; error?: string; projectId?: string; threadId?: string },
): ProjectRecipeWorkflowStepActivityPayload {
  return {
    workflowRunId: RUN_ID,
    stepId: `${RUN_ID}:${seq}`,
    stepKind,
    phase,
    ...(extra?.detail === undefined ? {} : { detail: extra.detail }),
    ...(extra?.error === undefined ? {} : { error: extra.error }),
    ...(extra?.projectId === undefined ? {} : { projectId: extra.projectId }),
    ...(extra?.threadId === undefined ? {} : { threadId: extra.threadId }),
  };
}

export function runActivity(
  phase: "completed" | "failed",
  error?: string,
): OrchestrationThreadActivity {
  return stepActivity(
    {
      workflowRunId: RUN_ID,
      stepId: `run:${RUN_ID}`,
      stepKind: "run",
      phase,
      ...(error === undefined ? {} : { error }),
    },
    { createdAt: "2026-07-17T10:05:00.000Z" },
  );
}

function shapeMessage(): ChatMessage {
  return {
    id: MessageId.make("message-shape-live-1"),
    role: "system",
    text: "Plan: shape.pr-review",
    streaming: false,
    createdAt: "2026-07-17T09:59:00.000Z",
    updatedAt: "2026-07-17T09:59:00.000Z",
    turnId: null,
    t3workExt: {
      visibleToUser: true,
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
          props: {
            name: "shape.pr-review",
            phases: [{ title: "Review" }, { title: "Decide" }],
            steps: [
              { phase: "Review", kind: "read", label: "github.pullRequest.get" },
              { phase: "Review", kind: "agent", label: "Summarize the risk" },
              { phase: "Decide", kind: "ask", label: "Merge it?" },
              { phase: "Decide", kind: "act", label: "github.pullRequest.merge" },
            ],
            workflowRunId: RUN_ID,
          },
        },
      ],
    },
  };
}

export async function renderTimeline(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  onOpenThread?: (input: { projectId: string; threadId: string }) => void,
): Promise<string> {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  const message = shapeMessage();
  return renderToStaticMarkup(
    <MessagesTimeline
      {...buildT3workMessagesTimelineTestProps()}
      threadActivities={activities}
      {...(onOpenThread ? { onOpenThread } : {})}
      timelineEntries={[
        { id: "timeline-0", kind: "message" as const, createdAt: message.createdAt, message },
      ]}
    />,
  );
}

export const countOccurrences = (markup: string, needle: string): number =>
  markup.split(needle).length - 1;
