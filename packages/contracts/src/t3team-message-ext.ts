import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
// WHO wrote a message lives in its own module (see t3team-message-author.ts); re-exported here so
// `T3TeamMessageExt`'s neighbours keep resolving from one place.
import { T3TeamMessageAuthor } from "./t3team-message-author.ts";

export {
  T3TeamMessageActorAuthor,
  T3TeamMessageAuthor,
  T3TeamMessageSystemAuthor,
  T3TeamMessageWorkflowAuthor,
} from "./t3team-message-author.ts";

// The attachment schemas moved to t3team-message-attachment-ext.ts (guard LOC ceiling);

// re-exported here so consumers keep resolving them from one place.

export * from "./t3team-message-attachment-ext.ts";

import { T3TeamMessageAttachment } from "./t3team-message-attachment-ext.ts";

export const T3TeamActorMessageUrgency = Schema.Literals(["normal", "urgent"]);
export type T3TeamActorMessageUrgency = typeof T3TeamActorMessageUrgency.Type;

/**
 * Inter-agent delivery metadata carried on an `actor`-role message.
 * `hopCount` / `rootThreadId` back the loop guard (a chain of auto-reactions
 * cannot run away); `senderThreadId` lets the receiving agent address a reply.
 */
export const T3TeamActorMessageInfo = Schema.Struct({
  senderThreadId: Schema.String,
  urgency: T3TeamActorMessageUrgency,
  hopCount: Schema.Number,
  rootThreadId: Schema.String,
  /**
   * The message SUBJECT: the sender-provided short summary (or an auto-generated
   * one derived from the body at delivery). Display-only — it titles the card and
   * the digest one-liner, and must never gate delivery, ordering, urgency or
   * batching. Optional so rows persisted before it existed keep decoding.
   */
  summary: Schema.optional(Schema.String),
  /**
   * Present when one reaction turn coalesces SEVERAL delivered messages into a
   * single batched input (inter-agent coalescing): every message id in the
   * batch, so a restart rehydrate can mark the whole batch as already reacted
   * instead of re-dispatching each delivery as its own turn.
   */
  messageIds: Schema.optional(Schema.Array(Schema.String)),
});
export type T3TeamActorMessageInfo = typeof T3TeamActorMessageInfo.Type;

export const T3TeamMessageStatus = Schema.Literals(["active", "waiting-for-input", "completed"]);
export type T3TeamMessageStatus = typeof T3TeamMessageStatus.Type;

/**
 * Present on a user message that answers a workflow's pending `askUser` with a structured
 * value (e.g. a decision-card choice). The message `text` stays the human-readable rendering
 * of the reply; the workflow-engine reactor resolves the parked ask with `value` instead of
 * the text when this is present.
 */
export const T3TeamMessageWorkflowReply = Schema.Struct({
  value: Schema.Unknown,
  /** The ask this reply answers (the decision card's pending correlationId). The reactor
   * ignores a structured reply whose correlationId no longer matches the pending ask, so a
   * stale card click cannot answer a NEWER question that was validated against an older one. */
  correlationId: Schema.optional(Schema.String),
});
export type T3TeamMessageWorkflowReply = typeof T3TeamMessageWorkflowReply.Type;

/**
 * Metadata for a user action emitted by an inline widget. The action starts a normal agent turn,
 * but it is transport rather than a direct reply to a parked workflow `askUser`; the workflow
 * reactor therefore must not consume it as pending input.
 */
export const T3TeamMessageWidgetReply = Schema.Struct({
  widgetId: TrimmedNonEmptyString,
  widgetTitle: TrimmedNonEmptyString,
});
export type T3TeamMessageWidgetReply = typeof T3TeamMessageWidgetReply.Type;

export const T3TeamMessageExt = Schema.Struct({
  author: Schema.optional(T3TeamMessageAuthor),
  displayText: Schema.optional(Schema.String),
  visibleToUser: Schema.optional(Schema.Boolean),
  visibleToAgent: Schema.optional(Schema.Boolean),
  status: Schema.optional(T3TeamMessageStatus),
  attachments: Schema.optional(Schema.Array(T3TeamMessageAttachment)),
  workflowReply: Schema.optional(T3TeamMessageWorkflowReply),
  widgetReply: Schema.optional(T3TeamMessageWidgetReply),
  /** Present on an `actor`-role message (inter-agent coordination). */
  actor: Schema.optional(T3TeamActorMessageInfo),
  /**
   * Present on the fork-provenance note of a forked thread: identifies the
   * thread this one was forked from so agents can search its full transcript
   * (`t3team.thread.search_source`) even when the fork itself was truncated.
   */
  forkSource: Schema.optional(
    Schema.Struct({
      threadId: TrimmedNonEmptyString,
      threadTitle: Schema.String,
      omittedMessageCount: Schema.optional(Schema.Number),
    }),
  ),
});
export type T3TeamMessageExt = typeof T3TeamMessageExt.Type;
