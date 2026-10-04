/**
 * Fork hook for the V1 transcript importer: how a V1 fork message lands on V2.
 *
 * - An imported row's fork ext (`t3team_ext_json`) rides its V2 context as the
 *   `t3team-message-ext` record, exactly as live V2 sends carry it: the timeline
 *   then shows a work-item send's own words (`displayText`) and cards instead of
 *   the prompt with the context dump, and keeps workflow author stamps,
 *   notification and reply markers. An ext that does not decode is dropped; one
 *   too large for a context record keeps its small fields.
 * - An inter-agent `actor` row becomes a user message sent by another agent
 *   (`createdBy: "agent"`, `senderThreadId`): upstream renders it as "Sent by
 *   another agent", and the legacy handoff gives it to the next provider session.
 * - A `system` note becomes a run-less system note in the recorder's shape, which
 *   the web routes to the fork's system rows. Its attachments become thread
 *   artifacts (rich-message cutover), so its context keeps only the small fields,
 *   as a live workflow note does (`t3team-workflowHostMessages.ts`).
 */
import {
  MessageId,
  type OrchestrationMessageContext,
  T3TeamMessageAttachment,
  T3TeamMessageExt,
  ThreadId,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  buildRunlessMessagePayloads,
  recorderTurnItemId,
} from "../../t3team-v2/t3team-threadMessagePayloads.ts";

export interface LegacyForkMessageRow {
  readonly message_id: string;
  readonly thread_id: string;
  readonly role: string;
  readonly text: string;
  readonly t3team_ext_json?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly ordinal: number;
}

const decodeRaw = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const decodeAttachment = Schema.decodeUnknownOption(T3TeamMessageAttachment);
const decodeExt = Schema.decodeUnknownOption(T3TeamMessageExt);
// One decoder per ext field: V1 rows come from many fork builds, and one field of a retired
// shape must not take the rest (the person's own words, the author) with it.
const fieldDecoders = Object.entries(T3TeamMessageExt.fields).map(
  ([key, field]) => [key, Schema.decodeUnknownOption(Schema.Struct({ [key]: field }))] as const,
);

/** The row's fork ext: every field (and attachment) that still decodes, or undefined. */
export function legacyMessageExt(json: string | null | undefined): T3TeamMessageExt | undefined {
  if (json === null || json === undefined) return undefined;
  const raw = Option.getOrUndefined(decodeRaw(json));
  if (raw === undefined) return undefined;
  const input = Array.isArray(raw.attachments)
    ? {
        ...raw,
        attachments: raw.attachments.flatMap((item) => Option.toArray(decodeAttachment(item))),
      }
    : raw;
  const ext: Record<string, unknown> = {};
  for (const [key, decode] of fieldDecoders) {
    if (input[key] === undefined) continue;
    Option.map(decode(input), (decoded) => Object.assign(ext, decoded));
  }
  if (Array.isArray(ext.attachments) && ext.attachments.length === 0) delete ext.attachments;
  return Object.keys(ext).length === 0 ? undefined : Option.getOrUndefined(decodeExt(ext));
}

/** `context` carrying `ext`: all of it when it fits one context record, else its small fields. */
export function withLegacyMessageExt(
  ext: T3TeamMessageExt | undefined,
  context: OrchestrationMessageContext | undefined,
): OrchestrationMessageContext | undefined {
  if (ext === undefined || Object.keys(ext).length === 0) return context;
  const carried = withT3TeamMessageExtContext(ext, context);
  if (carried !== context || ext.attachments === undefined) return carried;
  const { attachments: _tooLarge, ...small } = ext;
  return withLegacyMessageExt(small, context);
}

/** The ext without attachments: what a system note's own context carries. */
export const smallLegacyMessageExt = (ext: T3TeamMessageExt | undefined) => {
  if (ext === undefined) return undefined;
  const { attachments: _artifacts, ...small } = ext;
  return small;
};

const isForkRole = (role: string) => role === "actor" || role === "system";

/** The context an imported row carries: its V1 context plus its fork ext. */
export const legacyMessageContext = (
  row: Pick<LegacyForkMessageRow, "role" | "t3team_ext_json">,
  context: OrchestrationMessageContext | undefined,
) => {
  const ext = legacyMessageExt(row.t3team_ext_json);
  return withLegacyMessageExt(row.role === "system" ? smallLegacyMessageExt(ext) : ext, context);
};

/** The turn item id of a fork row (the recorder's), or undefined for user/assistant rows. */
export const legacyForkTurnItemId = (row: Pick<LegacyForkMessageRow, "role" | "message_id">) =>
  isForkRole(row.role) ? recorderTurnItemId(MessageId.make(row.message_id)) : undefined;

/**
 * The V2 message and turn item of an `actor` or `system` row (undefined for
 * user/assistant rows, which keep the importer's own shape). `context` is the
 * row's `legacyMessageContext`.
 */
export function legacyForkMessagePayloads(
  row: LegacyForkMessageRow,
  context: OrchestrationMessageContext | undefined,
) {
  if (!isForkRole(row.role)) return undefined;
  const senderThreadId = legacyMessageExt(row.t3team_ext_json)?.actor?.senderThreadId?.trim();
  return buildRunlessMessagePayloads({
    message: {
      threadId: ThreadId.make(row.thread_id),
      messageId: MessageId.make(row.message_id),
      text: row.text,
      ...(context === undefined ? {} : { context }),
      ...(row.role === "system"
        ? { role: "system" as const }
        : {
            role: "user" as const,
            createdBy: "agent" as const,
            ...(senderThreadId ? { senderThreadId: ThreadId.make(senderThreadId) } : {}),
          }),
    },
    ordinal: row.ordinal,
    createdAt: DateTime.makeUnsafe(row.created_at),
    now: DateTime.makeUnsafe(row.updated_at),
  });
}
