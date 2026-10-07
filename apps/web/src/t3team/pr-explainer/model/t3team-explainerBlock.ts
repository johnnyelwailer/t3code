/**
 * The body of an explainer step: an ordered list of blocks, each a discriminated union member on
 * `type`. New block types can be added freely: each block decodes on its own, so a type this
 * build does not know — or a known one a model got wrong — becomes an `unsupported` block that
 * keeps its id and type, and never fails the explainer around it. `validateT3TeamExplainer` lists
 * such blocks so a generator can repair them.
 */
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

import { TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";
import { T3TeamExplainerBlockBase } from "./t3team-explainerBlockBase";
import { T3TeamExplainerCodeBlock, T3TeamExplainerDiffBlock } from "./t3team-explainerDiff";
import {
  T3TeamExplainerImageBlock,
  T3TeamExplainerMapBlock,
  T3TeamExplainerSequenceBlock,
  T3TeamExplainerShapeBlock,
  T3TeamExplainerUiCompareBlock,
  T3TeamExplainerVideoBlock,
} from "./t3team-explainerVisual";

/** GitHub-flavoured markdown. Raw HTML is shown as text, never parsed. */
export const T3TeamExplainerMarkdownBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("markdown"),
  text: Schema.String,
});

/** A short boxed note. A `check` step usually leads with a `warn` or `risk` callout. */
export const T3TeamExplainerCalloutBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("callout"),
  tone: Schema.Literals(["info", "warn", "risk", "tip"]),
  title: Schema.optionalKey(Schema.String),
  text: Schema.String,
});

export const T3TeamExplainerKeyValueBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("keyValue"),
  title: Schema.optionalKey(Schema.String),
  items: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      value: Schema.String,
      tone: Schema.optionalKey(Schema.Literals(["good", "bad", "neutral"])),
    }),
  ),
});

export const T3TeamExplainerTableBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("table"),
  title: Schema.optionalKey(Schema.String),
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(Schema.String)),
});

/** An ordered "how to verify" list (`steps`) or a list of things to tick (`checks`). */
export const T3TeamExplainerChecklistBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("checklist"),
  style: Schema.optionalKey(Schema.Literals(["steps", "checks"])),
  title: Schema.optionalKey(Schema.String),
  items: Schema.Array(
    Schema.Struct({ text: Schema.String, done: Schema.optionalKey(Schema.Boolean) }),
  ),
});

/**
 * An embedded sub-widget: a thread widget artifact the host resolves and draws in the chat's
 * sandboxed frame, or a registered first-party component by name with JSON props.
 */
export const T3TeamExplainerWidgetBlock = Schema.Struct({
  ...T3TeamExplainerBlockBase,
  type: Schema.Literal("widget"),
  title: Schema.optionalKey(Schema.String),
  source: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("artifact"), artifactId: TrimmedNonEmptyString }),
    Schema.Struct({
      kind: Schema.Literal("component"),
      name: TrimmedNonEmptyString,
      props: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ]),
});

const KNOWN_BLOCKS = [
  T3TeamExplainerMarkdownBlock,
  T3TeamExplainerDiffBlock,
  T3TeamExplainerCodeBlock,
  T3TeamExplainerMapBlock,
  T3TeamExplainerSequenceBlock,
  T3TeamExplainerShapeBlock,
  T3TeamExplainerUiCompareBlock,
  T3TeamExplainerImageBlock,
  T3TeamExplainerVideoBlock,
  T3TeamExplainerCalloutBlock,
  T3TeamExplainerKeyValueBlock,
  T3TeamExplainerTableBlock,
  T3TeamExplainerWidgetBlock,
  T3TeamExplainerChecklistBlock,
] as const;

const KnownBlock = Schema.Union(KNOWN_BLOCKS);
export type T3TeamExplainerKnownBlock = typeof KnownBlock.Type;
export type T3TeamExplainerBlockType = T3TeamExplainerKnownBlock["type"];

/** A block this build could not read: an unknown `type`, or a known one with bad fields. */
export const T3TeamExplainerUnsupportedBlock = Schema.Struct({
  id: TrimmedNonEmptyString,
  type: Schema.Literal("unsupported"),
  layout: T3TeamExplainerBlockBase.layout,
  detail: T3TeamExplainerBlockBase.detail,
  /** The `type` it arrived with. */
  sourceType: Schema.String,
  reason: Schema.Literals(["unknownType", "invalid"]),
});
export type T3TeamExplainerUnsupportedBlock = typeof T3TeamExplainerUnsupportedBlock.Type;

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  KNOWN_BLOCKS.map((block) => block.fields.type.literal),
);
const decodeKnown = Schema.decodeUnknownOption(KnownBlock);

function field(raw: unknown, key: string): unknown {
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

/** Decodes one block on its own; anything unreadable becomes `unsupported`. */
export const T3TeamExplainerBlock = Schema.Unknown.pipe(
  Schema.decodeTo(
    Schema.Union([...KNOWN_BLOCKS, T3TeamExplainerUnsupportedBlock]),
    SchemaTransformation.transform<
      typeof KnownBlock.Encoded | typeof T3TeamExplainerUnsupportedBlock.Encoded,
      unknown
    >({
      decode: (raw) => {
        if (Option.isSome(decodeKnown(raw))) return raw as typeof KnownBlock.Encoded;
        if (field(raw, "type") === "unsupported") return raw as never;
        const type = field(raw, "type");
        const id = field(raw, "id");
        const layout = field(raw, "layout");
        return {
          id: typeof id === "string" && id.trim() ? id : "unknown",
          type: "unsupported",
          sourceType: typeof type === "string" ? type : "",
          reason: typeof type === "string" && KNOWN_TYPES.has(type) ? "invalid" : "unknownType",
          ...(layout === "main" || layout === "aside" || layout === "full" ? { layout } : {}),
          ...(field(raw, "detail") === true ? { detail: true } : {}),
        };
      },
      encode: (block) => block,
    }),
  ),
);
export type T3TeamExplainerBlock = typeof T3TeamExplainerBlock.Type;
export type T3TeamExplainerBlockOf<Type extends T3TeamExplainerBlock["type"]> = Extract<
  T3TeamExplainerBlock,
  { readonly type: Type }
>;
