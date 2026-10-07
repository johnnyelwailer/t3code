/**
 * An explainer: the data an agent emits to walk a reader through a subject — a pull request, a
 * branch, a set of files, or a concept with no code at all. It is data, never HTML; the player
 * renders it. Steps are ordered by meaning and dependency, not by file. Each step is a short
 * label, a terse caption, and an ordered list of blocks (`t3team-explainerBlock.ts`).
 *
 * The core is subject-agnostic: only `subject` and the source refs inside blocks (diff paths)
 * know what is being explained. `headSha` is the revision it was written against; a newer head
 * makes it stale. A concept has none.
 *
 * Text fields carry no hard maximum: a model that writes a long caption gets it cut at render,
 * not a rejected document. Run `validateT3TeamExplainer` for the cross-references a schema
 * cannot check.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";
import { T3TeamExplainerBlock } from "./t3team-explainerBlock";
import { T3TeamExplainerMap } from "./t3team-explainerVisual";

export * from "./t3team-explainerAnchor";
export * from "./t3team-explainerBlock";
export * from "./t3team-explainerDiff";
export * from "./t3team-explainerMedia";
export * from "./t3team-explainerValidate";
export * from "./t3team-explainerVisual";

export const T3TeamExplainerRisk = Schema.Literals(["low", "medium", "high"]);
export type T3TeamExplainerRisk = typeof T3TeamExplainerRisk.Type;

/** `check` asks the reader to look; `tests` shows coverage; `context` is the before-state. */
export const T3TeamExplainerStepKind = Schema.Literals(["context", "change", "check", "tests"]);
export type T3TeamExplainerStepKind = typeof T3TeamExplainerStepKind.Type;

/** What is being explained. A new subject mostly needs its own header and source refs. */
export const T3TeamExplainerSubject = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("pr"),
    number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    title: TrimmedNonEmptyString,
    url: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("branch"),
    name: TrimmedNonEmptyString,
    base: Schema.optionalKey(Schema.String),
    title: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("files"),
    title: TrimmedNonEmptyString,
    paths: Schema.Array(TrimmedNonEmptyString),
  }),
  Schema.Struct({ kind: Schema.Literal("concept"), title: TrimmedNonEmptyString }),
]);
export type T3TeamExplainerSubject = typeof T3TeamExplainerSubject.Type;

export const T3TeamExplainerStep = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: T3TeamExplainerStepKind,
  /** Two or three words for the rail ("Before", "New cache", "Tests"). Derived when absent. */
  label: Schema.optionalKey(TrimmedNonEmptyString),
  /** About ten words, plain short sentences (STE-100 style). */
  caption: TrimmedNonEmptyString,
  blocks: Schema.Array(T3TeamExplainerBlock),
});
export type T3TeamExplainerStep = typeof T3TeamExplainerStep.Type;

export const T3TeamExplainer = Schema.Struct({
  version: Schema.Literal(2),
  subject: T3TeamExplainerSubject,
  headSha: Schema.optionalKey(TrimmedNonEmptyString),
  generatedAt: IsoDateTime,
  /** The TL;DR line. */
  summary: TrimmedNonEmptyString,
  risk: Schema.optionalKey(T3TeamExplainerRisk),
  reviewMinutes: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  map: Schema.optionalKey(T3TeamExplainerMap),
  steps: Schema.Array(T3TeamExplainerStep),
});
export type T3TeamExplainer = typeof T3TeamExplainer.Type;
