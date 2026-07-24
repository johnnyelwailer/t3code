/**
 * `sketchSchema` — render an effect `Schema` as a compact, model-legible shape sketch plus a
 * synthesized example value, so the ask verbs can tell an agent what JSON to return WITHOUT the
 * workflow author restating the schema in the prompt (PR review: "the API should enforce the
 * schema itself without the need for any reinforcement in the prompt").
 *
 * Two outputs per node, both derived from a pure AST walk (no clock, no entropy, property order
 * taken from the AST) so the derived prompt — and therefore the verb payload's `argsHash` — is
 * byte-identical on replay:
 *   • `text` — TypeScript-ish type notation (`string`, `"a" | "b"`, `string[]`, `{ … }`), because
 *     it is far shorter than JSON Schema and mid-size models follow it reliably;
 *   • `example` — a JSON value of that shape, which is what models actually imitate.
 *
 * Author docs and examples ride along as effect **annotations** (`Schema.annotate({ description,
 * examples })`): a node's `examples[0]` replaces the synthesized example for that node, and
 * `description` is surfaced as a trailing comment by {@link t3work-sdk.schemaDescribe.ts}.
 * Anything unrecognized degrades to a loose label (`any JSON value`) rather than throwing — an
 * exotic schema must never break an ask.
 */

import type * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

/** One node's rendering: type notation + an example value of that type. */
export interface SchemaSketch {
  readonly text: string;
  readonly example: unknown;
}

/** Nesting depth past which a node renders as a bare `object` — keeps the sketch compact and
 * terminates recursive (`Schema.suspend`) schemas. */
const MAX_DEPTH = 4;

/** The `description` annotation of `ast` (checks-aware), if any. */
export function nodeDescription(ast: SchemaAST.AST): string | undefined {
  return SchemaAST.resolveDescription(ast);
}

/** An author-supplied `examples[0]` annotation, if any. */
function annotatedExample(ast: SchemaAST.AST): { readonly value: unknown } | undefined {
  const examples = SchemaAST.resolve(ast)?.examples;
  if (!Array.isArray(examples) || examples.length === 0) return undefined;
  return { value: examples[0] };
}

/** Drop the `undefined` members an optional/`| undefined` union carries, returning the defined
 * members (the shape a reader cares about). */
export function definedMembers(ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> {
  if (!SchemaAST.isUnion(ast)) return [ast];
  const defined = ast.types.filter((member) => !SchemaAST.isUndefined(member));
  return defined.length === 0 ? ast.types : defined;
}

function sketchUnion(ast: SchemaAST.Union, depth: number): SchemaSketch {
  const members = definedMembers(ast).map((member) => sketch(member, depth));
  const first = members[0] ?? { text: "any JSON value", example: null };
  const seen: Array<string> = [];
  for (const member of members) if (!seen.includes(member.text)) seen.push(member.text);
  return { text: seen.join(" | "), example: first.example };
}

function sketchArrays(ast: SchemaAST.Arrays, depth: number): SchemaSketch {
  const tuple = ast.elements.map((element) => sketch(element, depth + 1));
  if (tuple.length > 0) {
    return {
      text: `[${tuple.map((item) => item.text).join(", ")}]`,
      example: tuple.map((item) => item.example),
    };
  }
  const rest = ast.rest[0];
  if (rest === undefined) return { text: "unknown[]", example: [] };
  const item = sketch(rest, depth + 1);
  const needsParens = item.text.includes(" | ");
  return { text: `${needsParens ? `(${item.text})` : item.text}[]`, example: [item.example] };
}

function sketchObjects(ast: SchemaAST.Objects, depth: number): SchemaSketch {
  const index = ast.indexSignatures[0];
  if (ast.propertySignatures.length === 0 && index !== undefined) {
    const value = sketch(index.type, depth + 1);
    return { text: `{ [key: string]: ${value.text} }`, example: { key: value.example } };
  }
  const parts: Array<string> = [];
  const example: Record<string, unknown> = {};
  for (const prop of ast.propertySignatures) {
    if (typeof prop.name !== "string") continue;
    const optional = SchemaAST.isOptional(prop.type);
    const value = sketch(prop.type, depth + 1);
    parts.push(`${JSON.stringify(prop.name)}${optional ? "?" : ""}: ${value.text}`);
    example[prop.name] = value.example;
  }
  if (parts.length === 0) return { text: "object", example: {} };
  return { text: `{ ${parts.join(", ")} }`, example };
}

/** Render one AST node. Recursion is depth-capped, so a self-referential schema terminates. */
export function sketch(ast: SchemaAST.AST, depth = 0): SchemaSketch {
  const annotated = annotatedExample(ast);
  const withExample = (result: SchemaSketch): SchemaSketch =>
    annotated === undefined ? result : { text: result.text, example: annotated.value };
  if (depth > MAX_DEPTH) return withExample({ text: "object", example: {} });
  if (SchemaAST.isLiteral(ast)) {
    const literal = ast.literal as string | number | boolean | null;
    return withExample({ text: JSON.stringify(literal) ?? "null", example: literal });
  }
  if (SchemaAST.isString(ast)) return withExample({ text: "string", example: "text" });
  if (SchemaAST.isNumber(ast)) return withExample({ text: "number", example: 0 });
  if (SchemaAST.isBoolean(ast)) return withExample({ text: "boolean", example: true });
  if (SchemaAST.isNull(ast)) return withExample({ text: "null", example: null });
  if (SchemaAST.isUnion(ast)) return withExample(sketchUnion(ast, depth));
  if (SchemaAST.isArrays(ast)) return withExample(sketchArrays(ast, depth));
  if (SchemaAST.isObjects(ast)) return withExample(sketchObjects(ast, depth));
  if (SchemaAST.isSuspend(ast)) return withExample(sketch(ast.thunk(), depth + 1));
  // Declarations (Date, Option, …), enums, template literals and the `Unknown`/`Any` keywords:
  // name them by their identifier/title annotation when the author supplied one, else stay loose.
  const label = SchemaAST.resolveIdentifier(ast) ?? SchemaAST.resolveTitle(ast);
  return withExample({ text: label ?? "any JSON value", example: label === undefined ? null : {} });
}

/** Sketch a whole schema (its root AST node). */
export function sketchSchema(schema: Schema.Schema<unknown>): SchemaSketch {
  return sketch(schema.ast, 0);
}
