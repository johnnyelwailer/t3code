/**
 * `schemaToAffordance` (Epic 25 §askUser decision cards) — the recognizer must positively
 * identify each rich shape (string-literal union → choice, `Schema.Boolean` → boolean, a flat
 * scalar Struct → form) and fall back to `{ kind: "text" }` for everything it does not recognize
 * (exotic schemas, nested/non-scalar struct fields), so an exotic schema renders the freeform
 * reply box instead of breaking the ask.
 */

import { describe, expect, it } from "vite-plus/test";

import * as Schema from "effect/Schema";

import { schemaToAffordance } from "./t3team-sdk.affordance.ts";

describe("schemaToAffordance", () => {
  it("maps a string-literal union to a choice", () => {
    expect(schemaToAffordance(Schema.Literals(["ship-now", "hold", "rollback"]))).toEqual({
      kind: "choice",
      options: ["ship-now", "hold", "rollback"],
    });
  });

  it("maps a lone string literal to a single-option choice", () => {
    expect(schemaToAffordance(Schema.Literal("acknowledge"))).toEqual({
      kind: "choice",
      options: ["acknowledge"],
    });
  });

  it("maps a Struct whose single field is a literal union to a fielded choice", () => {
    const schema = Schema.Struct({ severity: Schema.Literals(["low", "high"]) });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({
      kind: "choice",
      field: "severity",
      options: ["low", "high"],
    });
  });

  it("maps Schema.Boolean to a boolean affordance (default labels applied at render)", () => {
    expect(schemaToAffordance(Schema.Boolean)).toEqual({ kind: "boolean" });
  });

  it("carries the opts labels onto a boolean affordance", () => {
    expect(
      schemaToAffordance(Schema.Boolean, { labels: { true: "Approve", false: "Reject" } }),
    ).toEqual({ kind: "boolean", labels: { true: "Approve", false: "Reject" } });
  });

  it("maps a flat scalar Struct to a form, one field per scalar", () => {
    const schema = Schema.Struct({
      title: Schema.String,
      count: Schema.Number,
      urgent: Schema.Boolean,
      severity: Schema.Literals(["low", "high"]),
    });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({
      kind: "form",
      fields: [
        { name: "title", type: "string", optional: false },
        { name: "count", type: "number", optional: false },
        { name: "urgent", type: "boolean", optional: false },
        { name: "severity", type: "literals", options: ["low", "high"], optional: false },
      ],
    });
  });

  it("marks Schema.optional fields as optional, unwrapping the undefined union", () => {
    const schema = Schema.Struct({
      note: Schema.optional(Schema.String),
      tier: Schema.optional(Schema.Literals(["free", "pro"])),
    });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({
      kind: "form",
      fields: [
        { name: "note", type: "string", optional: true },
        { name: "tier", type: "literals", options: ["free", "pro"], optional: true },
      ],
    });
  });

  it("maps a single non-literal scalar field to a one-field form", () => {
    const schema = Schema.Struct({ answer: Schema.String });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({
      kind: "form",
      fields: [{ name: "answer", type: "string", optional: false }],
    });
  });

  it("maps a multi-field Struct mixing a literal field and a scalar to a form", () => {
    const schema = Schema.Struct({
      severity: Schema.Literals(["low", "high"]),
      note: Schema.String,
    });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({
      kind: "form",
      fields: [
        { name: "severity", type: "literals", options: ["low", "high"], optional: false },
        { name: "note", type: "string", optional: false },
      ],
    });
  });

  it("falls the whole struct back to text for a nested-struct field (no recursive forms)", () => {
    const schema = Schema.Struct({
      title: Schema.String,
      meta: Schema.Struct({ owner: Schema.String }),
    });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({ kind: "text" });
  });

  it("falls the whole struct back to text for a non-scalar (array) field", () => {
    const schema = Schema.Struct({ tags: Schema.Array(Schema.String) });
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({ kind: "text" });
  });

  it("falls back to text when no schema is given", () => {
    expect(schemaToAffordance(undefined)).toEqual({ kind: "text" });
  });

  it("falls back to text for a plain string schema", () => {
    expect(schemaToAffordance(Schema.String)).toEqual({ kind: "text" });
  });

  it("falls back to text for non-string literal members", () => {
    expect(schemaToAffordance(Schema.Literals([1, 2, 3]))).toEqual({ kind: "text" });
    expect(schemaToAffordance(Schema.Literals(["yes", 1]))).toEqual({ kind: "text" });
  });

  it("falls back to text for a union with non-literal members", () => {
    const schema = Schema.Union([Schema.Literal("a"), Schema.String]);
    expect(schemaToAffordance(schema as Schema.Schema<unknown>)).toEqual({ kind: "text" });
  });
});
