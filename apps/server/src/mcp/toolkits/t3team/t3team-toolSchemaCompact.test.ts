import { expect, it } from "@effect/vitest";

import { dropNonFiniteNumberSpellings } from "./t3team-toolSchemaCompact.ts";

const nonFinite = { type: "string", enum: ["Infinity", "-Infinity", "NaN"] };

it("a number field advertises a plain number, other unions stay", () => {
  const schema = {
    type: "object",
    properties: {
      limit: { anyOf: [{ type: "number" }, nonFinite] },
      note: { anyOf: [{ type: "number" }, nonFinite], description: "kept note" },
      either: { anyOf: [{ type: "string" }, { type: "number" }] },
      mode: { type: "string", enum: ["Infinity", "-Infinity"] },
      list: { type: "array", items: { anyOf: [{ type: "number" }, nonFinite] } },
    },
  };
  expect(dropNonFiniteNumberSpellings(schema)).toEqual({
    type: "object",
    properties: {
      limit: { type: "number" },
      note: { type: "number", description: "kept note" },
      either: { anyOf: [{ type: "string" }, { type: "number" }] },
      mode: { type: "string", enum: ["Infinity", "-Infinity"] },
      list: { type: "array", items: { type: "number" } },
    },
  });
});
