/**
 * What a PR explainer step shows beside its diff. A step picks one modality and a pull request may
 * mix them. The architecture map is declared once per explainer (`T3TeamPrExplainerMap`) so it
 * persists across steps: a node or edge names the step it appears in (`since`) or leaves in
 * (`removedAt`), and the player derives each frame — the morph is data, not a picture per step.
 *
 * Layout is a coarse grid (`col`/`row`), not pixels, so a model can emit it and the client owns
 * the drawing.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(80));
const Label = TrimmedNonEmptyString.check(Schema.isMaxLength(60));
const GridIndex = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 }));

export const T3TeamPrExplainerMapNode = Schema.Struct({
  id: Id,
  label: Label,
  sublabel: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(60))),
  role: Schema.Literals(["ui", "service", "store", "external", "test"]),
  col: GridIndex,
  row: GridIndex,
  /** The step the node first appears in. Absent: present from the start. */
  since: Schema.optionalKey(Id),
  /** The step the node is removed in. It shows crossed out there and fades after. */
  removedAt: Schema.optionalKey(Id),
});
export type T3TeamPrExplainerMapNode = typeof T3TeamPrExplainerMapNode.Type;

export const T3TeamPrExplainerMapEdge = Schema.Struct({
  id: Id,
  from: Id,
  to: Id,
  label: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(40))),
  /** `async` draws dashed: a call nothing waits for. */
  style: Schema.optionalKey(Schema.Literals(["call", "async"])),
  since: Schema.optionalKey(Id),
  removedAt: Schema.optionalKey(Id),
});
export type T3TeamPrExplainerMapEdge = typeof T3TeamPrExplainerMapEdge.Type;

export const T3TeamPrExplainerMap = Schema.Struct({
  nodes: Schema.Array(T3TeamPrExplainerMapNode).check(Schema.isMaxLength(24)),
  edges: Schema.Array(T3TeamPrExplainerMapEdge).check(Schema.isMaxLength(48)),
});
export type T3TeamPrExplainerMap = typeof T3TeamPrExplainerMap.Type;

/** A frame of the explainer's map: which edges carry the active path, which nodes need a look. */
export const T3TeamPrExplainerMapFrame = Schema.Struct({
  kind: Schema.Literal("map"),
  flow: Schema.optionalKey(Schema.Array(Id)),
  warn: Schema.optionalKey(Schema.Array(Id)),
});

const Image = Schema.Struct({
  src: TrimmedNonEmptyString.check(Schema.isMaxLength(200_000)),
  alt: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  caption: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
});

export const T3TeamPrExplainerUiCompare = Schema.Struct({
  kind: Schema.Literal("uiCompare"),
  before: Image,
  after: Image,
  /** `slider` overlays the two; `pair` puts them side by side. */
  mode: Schema.Literals(["slider", "pair"]),
});

export const T3TeamPrExplainerSequenceChange = Schema.Literals(["added", "removed", "unchanged"]);

export const T3TeamPrExplainerSequence = Schema.Struct({
  kind: Schema.Literal("sequence"),
  actors: Schema.Array(Schema.Struct({ id: Id, label: Label })).check(Schema.isMaxLength(6)),
  messages: Schema.Array(
    Schema.Struct({
      id: Id,
      from: Id,
      to: Id,
      label: Label,
      style: Schema.Literals(["call", "return", "async"]),
      change: T3TeamPrExplainerSequenceChange,
    }),
  ).check(Schema.isMaxLength(16)),
});

export const T3TeamPrExplainerShapeField = Schema.Struct({
  name: Label,
  type: Schema.String.check(Schema.isMaxLength(60)),
  change: Schema.Literals(["added", "removed", "renamed", "retyped", "unchanged"]),
  /** The old name (renamed) or old type (retyped). */
  was: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(60))),
});
export type T3TeamPrExplainerShapeField = typeof T3TeamPrExplainerShapeField.Type;

/** A record, payload or state set before and after: one line per field. */
export const T3TeamPrExplainerShape = Schema.Struct({
  kind: Schema.Literal("shape"),
  name: Label,
  fields: Schema.Array(T3TeamPrExplainerShapeField).check(Schema.isMaxLength(24)),
});

export const T3TeamPrExplainerNoVisual = Schema.Struct({ kind: Schema.Literal("none") });

export const T3TeamPrExplainerVisual = Schema.Union([
  T3TeamPrExplainerMapFrame,
  T3TeamPrExplainerUiCompare,
  T3TeamPrExplainerSequence,
  T3TeamPrExplainerShape,
  T3TeamPrExplainerNoVisual,
]);
export type T3TeamPrExplainerVisual = typeof T3TeamPrExplainerVisual.Type;
