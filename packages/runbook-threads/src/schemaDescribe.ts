/**
 * `describeSchemaForPrompt` — the implicit, schema-derived prompt addition the ask verbs append
 * for an agent turn. This is the API "magically and implicitly generating a prompt addition based
 * on the schema" (PR review), replacing the hand-written JSON examples workflow authors used to
 * paste into their prompts: an author writes `agent("Judge these gates", { schema: Verdict })`
 * and the runtime — not the author — tells the model what shape to return.
 *
 * The block is: one instruction line, the schema shape (one line per top-level field of a Struct,
 * with the field's `description` annotation as a trailing comment), and one example JSON value.
 * A `description` annotation on the schema root becomes a leading gloss. Everything is derived by
 * the pure AST walk in `schemaSketch.ts`, so the block — and the enclosing verb
 * payload's `argsHash` — re-derives byte-identically on replay.
 */

import type * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

import { definedMembers, nodeDescription, sketch, sketchSchema } from "./schemaSketch.ts";

/** The provider-facing instruction shared by every schema-bearing ask. */
export const SCHEMA_INSTRUCTION =
  "Respond with ONLY a single JSON value matching the required schema — no prose, no code fence.";

/** Trailing `// …` comment for a field: the key annotation's description (`Schema.annotateKey`,
 * which is where a `Struct` field's own doc lands) or the value type's. */
function fieldComment(prop: SchemaAST.PropertySignature): string {
  const inner = definedMembers(prop.type)[0];
  const description =
    prop.type.context?.annotations?.description ??
    (inner === undefined ? undefined : nodeDescription(inner));
  return description === undefined ? "" : `  // ${description}`;
}

/** Multi-line rendering of a top-level Struct: one field per line, so a long schema stays
 * readable to the model; anything else renders as its one-line sketch. */
function shapeBlock(ast: SchemaAST.AST): string {
  if (!SchemaAST.isObjects(ast) || ast.propertySignatures.length === 0) return sketch(ast).text;
  const lines = ast.propertySignatures.flatMap((prop) => {
    if (typeof prop.name !== "string") return [];
    const optional = SchemaAST.isOptional(prop.type);
    const value = sketch(prop.type, 1);
    return [
      `  ${JSON.stringify(prop.name)}${optional ? "?" : ""}: ${value.text},${fieldComment(prop)}`,
    ];
  });
  return lines.length === 0 ? "object" : `{\n${lines.join("\n")}\n}`;
}

/**
 * The full prompt suffix for a schema-bearing agent ask: instruction + shape + example. Returns
 * just {@link SCHEMA_INSTRUCTION} when the schema carries no usable shape (e.g. `Schema.Unknown`),
 * so the caller can always append the result unconditionally.
 */
export function describeSchemaForPrompt(schema: Schema.Schema<unknown>): string {
  const { text, example } = sketchSchema(schema);
  if (text === "any JSON value") return SCHEMA_INSTRUCTION;
  const gloss = nodeDescription(schema.ast);
  const lines = [
    SCHEMA_INSTRUCTION,
    ...(gloss === undefined ? [] : [`The value represents: ${gloss}`]),
    "Required shape:",
    shapeBlock(schema.ast),
    `Example of a valid reply: ${JSON.stringify(example)}`,
  ];
  return lines.join("\n");
}
