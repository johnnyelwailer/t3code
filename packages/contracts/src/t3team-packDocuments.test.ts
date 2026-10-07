import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamPackDocument, T3TeamSubscribePackDocumentsInput } from "./t3team-packDocuments.ts";

const decode = Schema.decodeUnknownSync(T3TeamSubscribePackDocumentsInput);
const scope = { packId: "example-pack", collection: "notes" };

describe("T3TeamSubscribePackDocumentsInput", () => {
  it("allows a complete collection, a literal prefix or one exact key", () => {
    for (const input of [scope, { ...scope, prefix: "notes:" }, { ...scope, key: "notes:a" }]) {
      expect(decode(input)).toEqual(input);
    }
    expect(decode({ ...scope, prefix: "" })).toEqual({ ...scope, prefix: "" });
  });

  it("rejects ambiguous key and prefix selectors", () => {
    expect(() => decode({ ...scope, key: "notes:a", prefix: "notes:" })).toThrow();
  });

  it("rejects keys outside the store charset and length cap", () => {
    for (const key of ["", "notes:a b", "notes:a%", "é", "a".repeat(257)]) {
      expect(() => decode({ ...scope, key })).toThrow();
    }
    expect(decode({ ...scope, key: "a".repeat(256) }).key).toHaveLength(256);
  });
});

describe("T3TeamPackDocument", () => {
  it("accepts JSON documents and refuses non-JSON wire values", () => {
    const decodeDocument = Schema.decodeUnknownSync(T3TeamPackDocument);
    const row = { key: "notes:a", version: 1, updatedAt: "2026-10-07T10:00:00.000Z" };
    expect(decodeDocument({ ...row, doc: { values: [null, true, 1, "text"] } }).doc).toEqual({
      values: [null, true, 1, "text"],
    });
    for (const doc of [undefined, Number.NaN, 1n, { function: () => "value" }]) {
      expect(() => decodeDocument({ ...row, doc })).toThrow();
    }
  });
});
