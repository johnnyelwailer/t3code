/**
 * A PR explainer: the data an agent emits to walk a reviewer through what a diff does. It is data,
 * never HTML — the player renders it. Steps are ordered by meaning and dependency, not by file;
 * each carries a terse caption, the changed lines that prove it, and a visual
 * (`t3team-prExplainerVisual.ts`).
 *
 * `headSha` is the commit the explainer was written against: a newer head makes it stale.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { T3TeamPrExplainerMap, T3TeamPrExplainerVisual } from "./t3team-prExplainerVisual.ts";

export * from "./t3team-prExplainerVisual.ts";

const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(80));
const LineNumber = Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)));

export const T3TeamPrExplainerRisk = Schema.Literals(["low", "medium", "high"]);
export type T3TeamPrExplainerRisk = typeof T3TeamPrExplainerRisk.Type;

/** `check` asks the reviewer to look; `tests` shows coverage; `context` is the before-state. */
export const T3TeamPrExplainerStepKind = Schema.Literals(["context", "change", "check", "tests"]);
export type T3TeamPrExplainerStepKind = typeof T3TeamPrExplainerStepKind.Type;

/** Character offsets into one line's `content`, end exclusive: the words that changed. */
export const T3TeamPrExplainerTextRange = Schema.Struct({
  start: NonNegativeInt,
  end: NonNegativeInt,
});

export const T3TeamPrExplainerAnnotation = Schema.Struct({
  tone: Schema.Literals(["warning", "info"]),
  text: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
});
export type T3TeamPrExplainerAnnotation = typeof T3TeamPrExplainerAnnotation.Type;

export const T3TeamPrExplainerDiffLine = Schema.Struct({
  kind: Schema.Literals(["context", "add", "delete"]),
  oldLine: LineNumber,
  newLine: LineNumber,
  content: Schema.String.check(Schema.isMaxLength(400)),
  highlights: Schema.optionalKey(Schema.Array(T3TeamPrExplainerTextRange)),
  annotation: Schema.optionalKey(T3TeamPrExplainerAnnotation),
});
export type T3TeamPrExplainerDiffLine = typeof T3TeamPrExplainerDiffLine.Type;

/**
 * The 2–5 lines that prove a caption. `before`/`after` hold the surrounding context the reader can
 * expand into; `hunk` is the range the slice sits in, as the diff header names it.
 */
export const T3TeamPrExplainerDiffSlice = Schema.Struct({
  id: Id,
  path: TrimmedNonEmptyString.check(Schema.isMaxLength(400)),
  status: Schema.Literals(["added", "modified", "deleted", "renamed"]),
  additions: Schema.optionalKey(NonNegativeInt),
  deletions: Schema.optionalKey(NonNegativeInt),
  hunk: Schema.Struct({
    oldStart: NonNegativeInt,
    oldLines: NonNegativeInt,
    newStart: NonNegativeInt,
    newLines: NonNegativeInt,
  }),
  lines: Schema.Array(T3TeamPrExplainerDiffLine).check(Schema.isMaxLength(12)),
  before: Schema.optionalKey(Schema.Array(T3TeamPrExplainerDiffLine).check(Schema.isMaxLength(20))),
  after: Schema.optionalKey(Schema.Array(T3TeamPrExplainerDiffLine).check(Schema.isMaxLength(20))),
});
export type T3TeamPrExplainerDiffSlice = typeof T3TeamPrExplainerDiffSlice.Type;

export const T3TeamPrExplainerStep = Schema.Struct({
  id: Id,
  kind: T3TeamPrExplainerStepKind,
  /** About ten words, plain short sentences (STE-100 style). */
  caption: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  diffs: Schema.Array(T3TeamPrExplainerDiffSlice).check(Schema.isMaxLength(4)),
  visual: T3TeamPrExplainerVisual,
  /** Map nodes and edges this step is about: they light up on the map. */
  touches: Schema.optionalKey(
    Schema.Struct({
      nodes: Schema.optionalKey(Schema.Array(Id)),
      edges: Schema.optionalKey(Schema.Array(Id)),
    }),
  ),
});
export type T3TeamPrExplainerStep = typeof T3TeamPrExplainerStep.Type;

export const T3TeamPrExplainer = Schema.Struct({
  version: Schema.Literal(1),
  pullRequest: Schema.Struct({
    number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    title: TrimmedNonEmptyString.check(Schema.isMaxLength(300)),
    url: Schema.optionalKey(Schema.String),
  }),
  headSha: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  generatedAt: IsoDateTime,
  /** The TL;DR line. */
  summary: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  risk: T3TeamPrExplainerRisk,
  reviewMinutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 600 })),
  map: Schema.optionalKey(T3TeamPrExplainerMap),
  steps: Schema.Array(T3TeamPrExplainerStep).check(Schema.isMaxLength(40)),
});
export type T3TeamPrExplainer = typeof T3TeamPrExplainer.Type;

/**
 * Where a question about the explainer points. `diffLine` indexes into the slice's visible lines
 * (`before` + `lines` + `after`, in order); `textSelection` names the part the text was taken from.
 */
export const T3TeamPrExplainerAnchorTarget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("caption") }),
  Schema.Struct({
    kind: Schema.Literal("diffLine"),
    sliceId: Id,
    start: NonNegativeInt,
    end: NonNegativeInt,
  }),
  Schema.Struct({ kind: Schema.Literal("mapNode"), nodeId: Id }),
  Schema.Struct({ kind: Schema.Literal("mapEdge"), edgeId: Id }),
  Schema.Struct({ kind: Schema.Literal("visual") }),
  Schema.Struct({
    kind: Schema.Literal("textSelection"),
    within: Schema.Literals(["caption", "diff", "visual"]),
    sliceId: Schema.optionalKey(Id),
  }),
]);
export type T3TeamPrExplainerAnchorTarget = typeof T3TeamPrExplainerAnchorTarget.Type;

export const T3TeamPrExplainerAnchor = Schema.Struct({
  stepId: Id,
  target: T3TeamPrExplainerAnchorTarget,
  /** The words the question is about, as the reader saw them. */
  quote: Schema.String.check(Schema.isMaxLength(2000)),
});
export type T3TeamPrExplainerAnchor = typeof T3TeamPrExplainerAnchor.Type;

export const T3TeamPrExplainerAskMessage = Schema.Struct({
  id: Id,
  author: Schema.Literals(["reader", "agent"]),
  body: Schema.String.check(Schema.isMaxLength(8000)),
  /** `streaming`: the agent is still writing this answer. */
  status: Schema.Literals(["done", "streaming"]),
});
export type T3TeamPrExplainerAskMessage = typeof T3TeamPrExplainerAskMessage.Type;

export const T3TeamPrExplainerAskThread = Schema.Struct({
  id: Id,
  anchor: T3TeamPrExplainerAnchor,
  messages: Schema.Array(T3TeamPrExplainerAskMessage),
});
export type T3TeamPrExplainerAskThread = typeof T3TeamPrExplainerAskThread.Type;
