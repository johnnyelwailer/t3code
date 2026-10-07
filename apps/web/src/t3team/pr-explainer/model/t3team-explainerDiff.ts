/**
 * Changed lines and plain snippets inside an explainer step. A model writes these, so they ask
 * for as little arithmetic as possible: a slice names where it starts and what kind each line is,
 * and the renderer derives line numbers, the hunk header and the +/− counts. Changed words are
 * named as substrings (`highlight: ["cache.read"]`), never as character offsets.
 *
 * Ranges in this module and in anchors are end-exclusive: `{ start: 2, end: 4 }` is lines 2 and 3.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";
import { T3TeamExplainerBlockBase } from "./t3team-explainerBlockBase";

const LineStart = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const T3TeamExplainerAnnotation = Schema.Struct({
  tone: Schema.Literals(["warning", "info"]),
  /** A few words; longer notes are cut at render. */
  text: TrimmedNonEmptyString,
});
export type T3TeamExplainerAnnotation = typeof T3TeamExplainerAnnotation.Type;

export const T3TeamExplainerDiffLine = Schema.Struct({
  kind: Schema.Literals(["context", "add", "delete"]),
  content: Schema.String,
  /** Substrings of `content` to mark. Every occurrence is marked; context lines too. */
  highlight: Schema.optionalKey(Schema.Array(Schema.String)),
  annotation: Schema.optionalKey(T3TeamExplainerAnnotation),
});
export type T3TeamExplainerDiffLine = typeof T3TeamExplainerDiffLine.Type;

/**
 * The 2–5 lines that prove a caption, as one file's diff shows them. `before` and `after` are
 * the context lines around it the reader can expand into; all three run on without a gap.
 * `newStart`/`oldStart` number the first line shown (`before[0]`, else `lines[0]`); `oldStart`
 * defaults to `newStart`. `stats` is the whole file's change count, when known.
 */
export const T3TeamExplainerDiffBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("diff"),
  path: TrimmedNonEmptyString,
  status: Schema.Literals(["added", "modified", "deleted", "renamed"]),
  newStart: LineStart,
  oldStart: Schema.optionalKey(LineStart),
  lines: Schema.Array(T3TeamExplainerDiffLine),
  before: Schema.optionalKey(Schema.Array(T3TeamExplainerDiffLine)),
  after: Schema.optionalKey(Schema.Array(T3TeamExplainerDiffLine)),
  stats: Schema.optionalKey(
    Schema.Struct({
      additions: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      deletions: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
  ),
});
export type T3TeamExplainerDiffBlock = typeof T3TeamExplainerDiffBlock.Type;

/** A snippet that is not a diff: a config, a command, a call site. */
export const T3TeamExplainerCodeBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("code"),
  code: Schema.String,
  language: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  /** Substrings to mark, as on a diff line. */
  highlight: Schema.optionalKey(Schema.Array(Schema.String)),
});
export type T3TeamExplainerCodeBlock = typeof T3TeamExplainerCodeBlock.Type;
