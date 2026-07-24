/**
 * `schemaToAffordance` (Epic 25 §askUser decision cards) — derive a SERIALIZABLE descriptor of
 * the input affordance an `askUser` schema implies, so the host can render a decision card.
 * The live schema object never crosses the dispatch/journal boundary (it isn't canonical-JSON);
 * the descriptor is what rides in the `user.input` payload instead.
 *
 * Recognized shapes (everything else falls back to `{ kind: "text" }` — the freeform reply box —
 * so an exotic schema can never break the ask, it just renders less richly):
 *   • a string-literal union (`Schema.Literals([...])`, or a Struct whose single field is one)
 *     → `{ kind: "choice", field?, options }` (buttons);
 *   • `Schema.Boolean` → `{ kind: "boolean", labels? }` (approve/reject; labels honor the
 *     askUser opts, default "Yes"/"No" applied at render);
 *   • a Struct of scalar fields (string / number / boolean / string-literal) →
 *     `{ kind: "form", fields }` (one input per field). NESTED or non-scalar fields fall the
 *     whole struct back to text — no recursive forms.
 * Derivation is a pure AST walk, so the descriptor re-derives identically on replay.
 */

import type * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";

/** A scalar field of a `form` affordance. `options` is present only for a `literals` field. */
export interface AskFormField {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "literals";
  readonly options?: ReadonlyArray<string>;
  readonly optional: boolean;
}

/** Serializable input-affordance descriptor for an `askUser` decision card. */
export type AskAffordance =
  | {
      readonly kind: "choice";
      /** Present when the schema is a Struct wrapping the literal union in a single field —
       * the chosen option must be submitted as `{ [field]: option }`. */
      readonly field?: string;
      readonly options: ReadonlyArray<string>;
    }
  | {
      readonly kind: "boolean";
      /** Approve/reject button labels; absent → the host defaults to "Yes"/"No". */
      readonly labels?: { readonly true: string; readonly false: string };
    }
  | { readonly kind: "form"; readonly fields: ReadonlyArray<AskFormField> }
  | { readonly kind: "text" };

/** Extra derivation inputs from the askUser opts that the schema alone cannot carry. */
export interface SchemaToAffordanceOpts {
  readonly labels?: { readonly true: string; readonly false: string };
}

/** The string-literal options of `ast`, or `undefined` if it is not a pure string-literal
 * shape (a lone string Literal, or a Union whose every member is a string Literal). */
function literalOptions(ast: SchemaAST.AST): ReadonlyArray<string> | undefined {
  if (SchemaAST.isLiteral(ast)) {
    return typeof ast.literal === "string" ? [ast.literal] : undefined;
  }
  if (!SchemaAST.isUnion(ast)) return undefined;
  const options: string[] = [];
  for (const member of ast.types) {
    if (!SchemaAST.isLiteral(member) || typeof member.literal !== "string") return undefined;
    options.push(member.literal);
  }
  return options.length > 0 ? options : undefined;
}

/** Classify one struct field as a scalar form field, or `undefined` if it is nested/non-scalar
 * (which falls the whole struct back to text). `Schema.optional(X)` wraps the field as a
 * `Union[X, undefined]`, so unwrap a sole defined member before classifying. */
function scalarField(name: string, type: SchemaAST.AST): AskFormField | undefined {
  let inner = type;
  let optional = SchemaAST.isOptional(type);
  if (SchemaAST.isUnion(type)) {
    const defined = type.types.filter((member) => !SchemaAST.isUndefined(member));
    if (defined.length !== type.types.length) {
      optional = true;
      const sole = defined.length === 1 ? defined[0] : undefined;
      if (sole === undefined) return undefined;
      inner = sole;
    }
  }
  const options = literalOptions(inner);
  if (options !== undefined) return { name, type: "literals", options, optional };
  if (SchemaAST.isString(inner)) return { name, type: "string", optional };
  if (SchemaAST.isNumber(inner)) return { name, type: "number", optional };
  if (SchemaAST.isBoolean(inner)) return { name, type: "boolean", optional };
  return undefined;
}

/** Every property signature as a flat scalar field, or `undefined` if the struct is empty or any
 * field is nested/non-scalar (no recursive forms). */
function structToForm(ast: SchemaAST.Objects): ReadonlyArray<AskFormField> | undefined {
  if (ast.propertySignatures.length === 0) return undefined;
  const fields: AskFormField[] = [];
  for (const prop of ast.propertySignatures) {
    if (typeof prop.name !== "string") return undefined;
    const field = scalarField(prop.name, prop.type);
    if (field === undefined) return undefined;
    fields.push(field);
  }
  return fields;
}

export function schemaToAffordance(
  schema: Schema.Schema<unknown> | undefined,
  opts?: SchemaToAffordanceOpts,
): AskAffordance {
  if (schema === undefined) return { kind: "text" };
  const ast = schema.ast;
  const direct = literalOptions(ast);
  if (direct !== undefined) return { kind: "choice", options: direct };
  if (SchemaAST.isBoolean(ast)) {
    return { kind: "boolean", ...(opts?.labels === undefined ? {} : { labels: opts.labels }) };
  }
  if (SchemaAST.isObjects(ast) && ast.indexSignatures.length === 0) {
    // A single literal-union field stays a `choice` (buttons, field-wrapped) — richer than a
    // one-control form.
    if (ast.propertySignatures.length === 1) {
      const only = ast.propertySignatures[0];
      if (only !== undefined && typeof only.name === "string") {
        const nested = literalOptions(only.type);
        if (nested !== undefined) return { kind: "choice", field: only.name, options: nested };
      }
    }
    const fields = structToForm(ast);
    if (fields !== undefined) return { kind: "form", fields };
  }
  return { kind: "text" };
}
