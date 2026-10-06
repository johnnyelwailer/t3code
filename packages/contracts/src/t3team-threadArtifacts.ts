/**
 * Fork thread artifacts: rich rows attached to a thread (and optionally to one
 * of its messages) that V2 messages and turn items cannot carry — widgets,
 * draft mutations, workflow and decision cards, actor cards, work-item
 * attachments, and pack-defined kinds.
 *
 * An artifact is a durable keyed record: writers upsert by `id` (choose a
 * deterministic id to make writes idempotent) and clients render it next to
 * `messageId` when set, otherwise in the thread's timeline at `createdAt`.
 * `kind` selects the renderer; `payload` is the kind's own JSON.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, MessageId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TeamThreadArtifactId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
export type T3TeamThreadArtifactId = typeof T3TeamThreadArtifactId.Type;

/** Lower-case dotted/dashed name, e.g. `widget`, `draft-mutation`, `<pack>.card`. */
export const T3TeamThreadArtifactKind = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9._-]{0,63}$/),
);
export type T3TeamThreadArtifactKind = typeof T3TeamThreadArtifactKind.Type;

export const T3TeamThreadArtifact = Schema.Struct({
  id: T3TeamThreadArtifactId,
  threadId: ThreadId,
  messageId: Schema.NullOr(MessageId),
  kind: T3TeamThreadArtifactKind,
  payload: Schema.Unknown,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type T3TeamThreadArtifact = typeof T3TeamThreadArtifact.Type;

export const T3TeamSubscribeThreadArtifactsInput = Schema.Struct({ threadId: ThreadId });
export type T3TeamSubscribeThreadArtifactsInput = typeof T3TeamSubscribeThreadArtifactsInput.Type;

/** First item is always the thread's `snapshot`; later items are changes to it. */
export const T3TeamThreadArtifactsStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    threadId: ThreadId,
    artifacts: Schema.Array(T3TeamThreadArtifact),
  }),
  Schema.Struct({ type: Schema.Literal("upsert"), artifact: T3TeamThreadArtifact }),
  Schema.Struct({
    type: Schema.Literal("removed"),
    threadId: ThreadId,
    artifactId: T3TeamThreadArtifactId,
  }),
]);
export type T3TeamThreadArtifactsStreamEvent = typeof T3TeamThreadArtifactsStreamEvent.Type;
