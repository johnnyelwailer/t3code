/**
 * Where a reader's question about an explainer points, and the thread it grows into. Every block
 * is anchorable by its id. Line ranges are end-exclusive and index the diff block's visible lines
 * (`before` + `lines` + `after`, in order).
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";

const Id = TrimmedNonEmptyString;

export const T3TeamExplainerAnchorTarget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("caption") }),
  /** A whole block. `atSeconds` marks the moment in a video. */
  Schema.Struct({
    kind: Schema.Literal("block"),
    blockId: Id,
    atSeconds: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
  }),
  Schema.Struct({
    kind: Schema.Literal("diffLines"),
    blockId: Id,
    start: NonNegativeInt,
    end: NonNegativeInt,
  }),
  Schema.Struct({ kind: Schema.Literal("mapNode"), blockId: Id, nodeId: Id }),
  Schema.Struct({ kind: Schema.Literal("mapEdge"), blockId: Id, edgeId: Id }),
  /** Words selected in the caption. */
  Schema.Struct({ kind: Schema.Literal("captionText") }),
  /** Words selected inside one block: markdown, code, a table or a diff. */
  Schema.Struct({ kind: Schema.Literal("blockText"), blockId: Id }),
]);
export type T3TeamExplainerAnchorTarget = typeof T3TeamExplainerAnchorTarget.Type;

export const T3TeamExplainerAnchor = Schema.Struct({
  stepId: Id,
  target: T3TeamExplainerAnchorTarget,
  /** The words the question is about, as the reader saw them. */
  quote: Schema.String,
});
export type T3TeamExplainerAnchor = typeof T3TeamExplainerAnchor.Type;

export const T3TeamExplainerAskMessage = Schema.Struct({
  id: Id,
  author: Schema.Literals(["reader", "agent"]),
  body: Schema.String,
  /** `streaming`: the agent is still writing this answer. */
  status: Schema.Literals(["done", "streaming"]),
});
export type T3TeamExplainerAskMessage = typeof T3TeamExplainerAskMessage.Type;

export const T3TeamExplainerAskThread = Schema.Struct({
  id: Id,
  /** The explainer revision the question was asked on. A different one makes it outdated. */
  headSha: Schema.optionalKey(Id),
  anchor: T3TeamExplainerAnchor,
  messages: Schema.Array(T3TeamExplainerAskMessage),
});
export type T3TeamExplainerAskThread = typeof T3TeamExplainerAskThread.Type;
