import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { schemaToAffordance } from "./affordance.ts";

describe("host-neutral ask affordances", () => {
  it("turns string literals into choices", () => {
    expect(schemaToAffordance(Schema.Literals(["ship", "hold"]))).toEqual({
      kind: "choice",
      options: ["ship", "hold"],
    });
  });

  it("keeps a single literal field as a fielded choice", () => {
    expect(
      schemaToAffordance(Schema.Struct({ decision: Schema.Literals(["ship", "hold"]) })),
    ).toEqual({
      kind: "choice",
      field: "decision",
      options: ["ship", "hold"],
    });
  });

  it("turns boolean schemas into labeled approval affordances", () => {
    expect(schemaToAffordance(Schema.Boolean, { labels: { true: "Ship", false: "Hold" } })).toEqual(
      {
        kind: "boolean",
        labels: { true: "Ship", false: "Hold" },
      },
    );
  });

  it("turns flat scalar structs into forms", () => {
    expect(
      schemaToAffordance(
        Schema.Struct({
          summary: Schema.String,
          score: Schema.Number,
          approved: Schema.optional(Schema.Boolean),
        }),
      ),
    ).toEqual({
      kind: "form",
      fields: [
        { name: "summary", type: "string", optional: false },
        { name: "score", type: "number", optional: false },
        { name: "approved", type: "boolean", optional: true },
      ],
    });
  });

  it("falls back to text for nested or otherwise unsupported schemas", () => {
    expect(
      schemaToAffordance(Schema.Struct({ review: Schema.Struct({ ok: Schema.Boolean }) })),
    ).toEqual({ kind: "text" });
    expect(schemaToAffordance(undefined)).toEqual({ kind: "text" });
  });
});
