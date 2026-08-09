/**
 * The implicit schema description is the contract that lets a workflow author stop hand-writing
 * JSON examples into prompts. It must (a) show every shape a mid-size model needs — fields,
 * optionality, unions, literals, arrays, nesting — (b) honor author `description`/`examples`
 * annotations, (c) never throw on an exotic schema, and (d) be byte-deterministic, because the
 * derived text lands in the verb payload whose `argsHash` guards replay.
 */

import { describe, expect, it } from "vite-plus/test";

import * as Schema from "effect/Schema";

import { SCHEMA_INSTRUCTION, describeSchemaForPrompt } from "./t3team-sdk.schemaDescribe.ts";
import { sketchSchema } from "./t3team-sdk.schemaSketch.ts";

const asUnknown = <A>(schema: Schema.Schema<A>): Schema.Schema<unknown> =>
  schema as unknown as Schema.Schema<unknown>;

describe("sketchSchema", () => {
  it("renders scalars with an example value of that type", () => {
    expect(sketchSchema(Schema.String)).toEqual({ text: "string", example: "text" });
    expect(sketchSchema(Schema.Number)).toEqual({ text: "number", example: 0 });
    expect(sketchSchema(Schema.Boolean)).toEqual({ text: "boolean", example: true });
  });

  it("renders a literal union as the alternatives, example = the first", () => {
    expect(sketchSchema(asUnknown(Schema.Literals(["pass", "fail", "warn"])))).toEqual({
      text: '"pass" | "fail" | "warn"',
      example: "pass",
    });
  });

  it("renders a mixed union and parenthesizes it inside an array", () => {
    expect(sketchSchema(asUnknown(Schema.Union([Schema.String, Schema.Number])))).toEqual({
      text: "string | number",
      example: "text",
    });
    expect(
      sketchSchema(asUnknown(Schema.Array(Schema.Union([Schema.String, Schema.Number])))),
    ).toEqual({ text: "(string | number)[]", example: ["text"] });
  });

  it("renders arrays, nested structs and optional fields", () => {
    const schema = Schema.Struct({
      title: Schema.String,
      tags: Schema.Array(Schema.String),
      owner: Schema.Struct({ id: Schema.Number, name: Schema.String }),
      note: Schema.optional(Schema.String),
    });
    expect(sketchSchema(asUnknown(schema))).toEqual({
      text: '{ "title": string, "tags": string[], "owner": { "id": number, "name": string }, "note"?: string }',
      example: { title: "text", tags: ["text"], owner: { id: 0, name: "text" }, note: "text" },
    });
  });

  it("prefers an author-supplied `examples` annotation over the synthesized value", () => {
    const schema = Schema.Struct({
      sha: Schema.String.annotate({ examples: ["deadbeef"] }),
    });
    expect(sketchSchema(asUnknown(schema)).example).toEqual({ sha: "deadbeef" });
  });

  it("degrades an unrecognized schema instead of throwing", () => {
    expect(sketchSchema(Schema.Unknown)).toEqual({ text: "any JSON value", example: null });
  });
});

describe("describeSchemaForPrompt", () => {
  it("describes a struct field-by-field with an example reply (snapshot)", () => {
    const schema = Schema.Struct({
      verdict: Schema.Literals(["pass", "fail"]),
      score: Schema.Number.annotate({ description: "0-10, higher is better" }),
      blockers: Schema.Array(Schema.String),
      note: Schema.optional(Schema.String),
    });
    expect(describeSchemaForPrompt(asUnknown(schema))).toBe(
      [
        SCHEMA_INSTRUCTION,
        "Required shape:",
        "{",
        '  "verdict": "pass" | "fail",',
        '  "score": number,  // 0-10, higher is better',
        '  "blockers": string[],',
        '  "note"?: string,',
        "}",
        'Example of a valid reply: {"verdict":"pass","score":0,"blockers":["text"],"note":"text"}',
      ].join("\n"),
    );
  });

  it("uses a field's key-annotation description as its comment", () => {
    const schema = Schema.Struct({
      owner: Schema.String.annotateKey({ description: "github login" }),
    });
    expect(describeSchemaForPrompt(asUnknown(schema))).toContain(
      '"owner": string,  // github login',
    );
  });

  it("surfaces a root `description` annotation as a gloss", () => {
    const schema = Schema.Struct({ ok: Schema.Boolean }).annotate({
      description: "the gate decision",
    });
    expect(describeSchemaForPrompt(asUnknown(schema))).toContain(
      "The value represents: the gate decision",
    );
  });

  it("describes a non-struct root inline (snapshot)", () => {
    expect(describeSchemaForPrompt(asUnknown(Schema.Literals(["ship", "hold"])))).toBe(
      [
        SCHEMA_INSTRUCTION,
        "Required shape:",
        '"ship" | "hold"',
        'Example of a valid reply: "ship"',
      ].join("\n"),
    );
  });

  it("falls back to the generic instruction when the schema carries no shape", () => {
    expect(describeSchemaForPrompt(Schema.Unknown)).toBe(SCHEMA_INSTRUCTION);
  });

  it("is deterministic — re-deriving the same schema yields byte-identical text", () => {
    const make = () =>
      Schema.Struct({
        b: Schema.String,
        a: Schema.Number,
        nested: Schema.Struct({ z: Schema.Boolean, y: Schema.String }),
      });
    expect(describeSchemaForPrompt(asUnknown(make()))).toBe(
      describeSchemaForPrompt(asUnknown(make())),
    );
  });

  it("terminates on a recursive schema", () => {
    interface Node {
      readonly name: string;
      readonly children: ReadonlyArray<Node>;
    }
    const Node: Schema.Schema<Node> = Schema.Struct({
      name: Schema.String,
      children: Schema.Array(Schema.suspend(() => Node)),
    });
    expect(describeSchemaForPrompt(asUnknown(Node))).toContain('"name": string');
  });
});
