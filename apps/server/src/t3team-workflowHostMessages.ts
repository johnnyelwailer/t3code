/**
 * How a workflow message with a fork ext becomes V2 writes (`t3team-workflowHost.ts`).
 *
 * A V2 message carries text plus a context; it has no slot for rich rows. So one workflow
 * message splits into:
 *   • the run-less message itself (skipped when its text is empty — a bare widget), whose
 *     context carries the ext's small fields (author, status, visibility) so clients and fork
 *     readers still see "waiting for input" and who wrote it (`readT3TeamMessageExtContext`);
 *   • one `widget` artifact per widget attachment (the same carrier `t3team.widget.show` uses);
 *   • one `message-ext` artifact holding the ext with its remaining attachments (decision cards,
 *     resource refs, plan/shape views, draft refs), keyed to the message it belongs to.
 */
import {
  MessageId,
  type T3TeamMessageAttachment,
  type T3TeamMessageExt,
  ThreadId,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";

import type { T3TeamThreadArtifactInput } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import type { RecordThreadMessageInput } from "./t3team-v2/t3team-threadMessageRecorder.ts";
import { T3TEAM_WIDGET_ARTIFACT_KIND, t3teamWidgetArtifactId } from "./t3team-widgetShowTool.ts";
import type { WorkflowHostMessageInput } from "./t3team-workflowHostPort.ts";

/** Artifact kind of a message's rich fork ext, rendered next to `messageId`. */
export const T3TEAM_MESSAGE_EXT_ARTIFACT_KIND = "message-ext";

/** Deterministic, so re-posting a message re-upserts its ext in place. */
export const t3teamMessageExtArtifactId = (messageId: string) => `message-ext:${messageId}`;

type WidgetAttachment = Extract<T3TeamMessageAttachment, { readonly kind: "widget" }>;

const isWidget = (attachment: T3TeamMessageAttachment): attachment is WidgetAttachment =>
  attachment.kind === "widget";

export interface WorkflowMessageWrites {
  /** Absent when the message has no text of its own. */
  readonly record?: RecordThreadMessageInput;
  readonly artifacts: ReadonlyArray<T3TeamThreadArtifactInput>;
}

export function splitWorkflowMessage(input: WorkflowHostMessageInput): WorkflowMessageWrites {
  const threadId = ThreadId.make(input.threadId);
  const messageId = MessageId.make(input.messageId);
  const { attachments = [], ...fields } = input.ext ?? {};
  const hasText = input.text.trim().length > 0;
  const anchor = hasText ? messageId : null;
  const widgets = attachments.filter(isWidget);
  const rich = attachments.filter((attachment) => !isWidget(attachment));

  const artifacts: T3TeamThreadArtifactInput[] = widgets.map((widget) => ({
    id: t3teamWidgetArtifactId(widget.widget.widgetId),
    threadId,
    messageId: anchor,
    kind: T3TEAM_WIDGET_ARTIFACT_KIND,
    payload: widget,
  }));
  if (rich.length > 0) {
    artifacts.push({
      id: t3teamMessageExtArtifactId(input.messageId),
      threadId,
      messageId: anchor,
      kind: T3TEAM_MESSAGE_EXT_ARTIFACT_KIND,
      payload: { ...fields, attachments: rich } satisfies T3TeamMessageExt,
    });
  }
  if (!hasText) return { artifacts };

  const context =
    Object.keys(fields).length === 0 ? undefined : withT3TeamMessageExtContext(fields);
  return {
    record: {
      threadId,
      messageId,
      role: input.role,
      text: input.text,
      ...(context === undefined ? {} : { context }),
    },
    artifacts,
  };
}
