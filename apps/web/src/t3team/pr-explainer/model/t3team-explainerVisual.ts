/**
 * Picture blocks of an explainer step. The architecture map is declared once per explainer
 * (`T3TeamExplainerMap`) so it persists across steps: a node or edge names the step it appears in
 * (`since`) or leaves in (`removedAt`), and the player derives each frame — the morph is data,
 * not a picture per step. A step shows a frame of it with a `map` block.
 *
 * Layout is a coarse grid (`col`/`row`), not pixels, so a model can emit it and the client owns
 * the drawing.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";
import { T3TeamExplainerBlockBase } from "./t3team-explainerBlockBase";
import { T3TeamExplainerImage, T3TeamExplainerVideo } from "./t3team-explainerMedia";

const Id = TrimmedNonEmptyString;
const Label = TrimmedNonEmptyString;
const GridIndex = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 12 }));

export const T3TeamExplainerMapNode = Schema.Struct({
  id: Id,
  label: Label,
  sublabel: Schema.optionalKey(Schema.String),
  role: Schema.Literals(["ui", "service", "store", "external", "test"]),
  col: GridIndex,
  row: GridIndex,
  /** The step the node first appears in. Absent: present from the start. */
  since: Schema.optionalKey(Id),
  /** The step the node is removed in. It shows crossed out there and fades after. */
  removedAt: Schema.optionalKey(Id),
});
export type T3TeamExplainerMapNode = typeof T3TeamExplainerMapNode.Type;

export const T3TeamExplainerMapEdge = Schema.Struct({
  id: Id,
  from: Id,
  to: Id,
  label: Schema.optionalKey(Schema.String),
  /** `async` draws dashed: a call nothing waits for. */
  style: Schema.optionalKey(Schema.Literals(["call", "async"])),
  /** Like a node's. An edge also leaves with either node it joins. */
  since: Schema.optionalKey(Id),
  removedAt: Schema.optionalKey(Id),
});
export type T3TeamExplainerMapEdge = typeof T3TeamExplainerMapEdge.Type;

export const T3TeamExplainerMap = Schema.Struct({
  nodes: Schema.Array(T3TeamExplainerMapNode),
  edges: Schema.Array(T3TeamExplainerMapEdge),
});
export type T3TeamExplainerMap = typeof T3TeamExplainerMap.Type;

/** The explainer's map at this step: what the step is about, the path, what needs a look. */
export const T3TeamExplainerMapBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("map"),
  /** Nodes and edges this step is about: they light up. */
  touches: Schema.optionalKey(
    Schema.Struct({
      nodes: Schema.optionalKey(Schema.Array(Id)),
      edges: Schema.optionalKey(Schema.Array(Id)),
    }),
  ),
  /** Edges that carry the active path: dots run along them. */
  flow: Schema.optionalKey(Schema.Array(Id)),
  /** Nodes that need a check. */
  warn: Schema.optionalKey(Schema.Array(Id)),
});
export type T3TeamExplainerMapBlock = typeof T3TeamExplainerMapBlock.Type;

export const T3TeamExplainerUiCompareBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("uiCompare"),
  before: T3TeamExplainerImage,
  after: T3TeamExplainerImage,
  /** `slider` overlays the two; `pair` puts them side by side. */
  mode: Schema.Literals(["slider", "pair"]),
});
export type T3TeamExplainerUiCompareBlock = typeof T3TeamExplainerUiCompareBlock.Type;

export const T3TeamExplainerSequenceBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("sequence"),
  actors: Schema.Array(Schema.Struct({ id: Id, label: Label })),
  messages: Schema.Array(
    Schema.Struct({
      id: Id,
      from: Id,
      to: Id,
      label: Label,
      style: Schema.Literals(["call", "return", "async"]),
      change: Schema.Literals(["added", "removed", "unchanged"]),
    }),
  ),
});
export type T3TeamExplainerSequenceBlock = typeof T3TeamExplainerSequenceBlock.Type;

export const T3TeamExplainerShapeField = Schema.Struct({
  name: Label,
  type: Schema.String,
  change: Schema.Literals(["added", "removed", "renamed", "retyped", "unchanged"]),
  /** The old name (renamed) or old type (retyped). */
  was: Schema.optionalKey(Schema.String),
});
export type T3TeamExplainerShapeField = typeof T3TeamExplainerShapeField.Type;

/** A record, payload or state set before and after: one line per field. */
export const T3TeamExplainerShapeBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("shape"),
  name: Label,
  fields: Schema.Array(T3TeamExplainerShapeField),
});
export type T3TeamExplainerShapeBlock = typeof T3TeamExplainerShapeBlock.Type;

export const T3TeamExplainerImageBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("image"),
  ...T3TeamExplainerImage.fields,
});
export type T3TeamExplainerImageBlock = typeof T3TeamExplainerImageBlock.Type;

export const T3TeamExplainerVideoBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("video"),
  ...T3TeamExplainerVideo.fields,
});
export type T3TeamExplainerVideoBlock = typeof T3TeamExplainerVideoBlock.Type;
