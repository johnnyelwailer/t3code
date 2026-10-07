import { describe, expect, it } from "vite-plus/test";

import {
  decodePackCollectionsDefinition,
  defineCollections,
  mergePackCollectionsDefinitions,
} from "./index.ts";

const definition = {
  items: { maxDocBytes: 256_000, retention: { afterUnreadDays: 30 }, viewWritable: false },
  drafts: { maxDocBytes: 64_000, retention: { afterUpdateDays: 7 } },
  notes: { maxDocBytes: 16_000, retention: "keep", viewWritable: true },
  quotaBytes: 200 * 1024 * 1024,
} as const;

describe("pack collection definitions", () => {
  it("preserves the flat collection shape and view write policy", () => {
    const collections = defineCollections(definition);
    expect(collections).toEqual(definition);
    expect(collections.items.viewWritable).toBe(false);
    expect(collections.notes.retention).toBe("keep");
  });

  it("takes immutable copies of collection and retention data", () => {
    const input = {
      items: { maxDocBytes: 100, retention: { afterUnreadDays: 30 } },
      quotaBytes: 1000,
    };
    const result = defineCollections(input);
    input.items.maxDocBytes = 200;
    input.items.retention.afterUnreadDays = 1;
    expect(result.items.maxDocBytes).toBe(100);
    expect(result.items.retention.afterUnreadDays).toBe(30);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(Object.isFrozen(result.items.retention)).toBe(true);
  });

  it.each([0, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid positive bounds: %s",
    (value) => {
      expect(() => decodePackCollectionsDefinition({ ...definition, quotaBytes: value })).toThrow();
      expect(() =>
        decodePackCollectionsDefinition({
          ...definition,
          items: { ...definition.items, maxDocBytes: value },
        }),
      ).toThrow();
      expect(() =>
        decodePackCollectionsDefinition({
          ...definition,
          items: { ...definition.items, retention: { afterUnreadDays: value } },
        }),
      ).toThrow();
    },
  );

  it.each(["../items", "Items", "", "a".repeat(257)])("rejects collection name %s", (name) => {
    expect(() =>
      decodePackCollectionsDefinition({
        [name]: definition.items,
        quotaBytes: definition.quotaBytes,
      }),
    ).toThrow(/identifier/);
  });

  it.each([
    { ...definition.items, retention: { afterUpdateDays: 7, afterUnreadDays: 30 } },
    { ...definition.items, retention: {} },
    { ...definition.items, retention: "forever" },
    { ...definition.items, viewWritable: "true" },
    { ...definition.items, viewWritable: undefined },
    { ...definition.items, sql: "select 1" },
    { ...definition.items, maxDocBytes: () => 100 },
    new Map(),
  ])("rejects invalid collection data %#", (items) => {
    expect(() => decodePackCollectionsDefinition({ items, quotaBytes: 1000 })).toThrow();
  });

  it("rejects getters without evaluating executable metadata", () => {
    let invoked = false;
    const input = {
      ...definition,
      get quotaBytes() {
        invoked = true;
        return 1000;
      },
    };
    expect(() => decodePackCollectionsDefinition(input)).toThrow(/data fields/);
    expect(invoked).toBe(false);
  });

  it("rejects symbols, inherited class instances and empty collection sets", () => {
    expect(() =>
      decodePackCollectionsDefinition({ ...definition, [Symbol("code")]: true }),
    ).toThrow();
    expect(() => decodePackCollectionsDefinition(Object.create(definition))).toThrow();
    expect(() => decodePackCollectionsDefinition({ quotaBytes: 1000 })).toThrow(
      /declare a collection/,
    );
  });

  it("merges module data while enforcing one pack quota and unique collection names", () => {
    const items = { items: definition.items, quotaBytes: definition.quotaBytes };
    const notes = { notes: definition.notes, quotaBytes: definition.quotaBytes };
    expect(mergePackCollectionsDefinitions([items, notes])).toEqual({ ...items, ...notes });
    expect(() => mergePackCollectionsDefinitions([items, items])).toThrow(/duplicate collection/);
    expect(() => mergePackCollectionsDefinitions([items, { ...notes, quotaBytes: 1000 }])).toThrow(
      /conflicting quotaBytes/,
    );
    expect(() => mergePackCollectionsDefinitions([items, () => notes])).toThrow(
      /plain data object/,
    );
    expect(() => mergePackCollectionsDefinitions([])).toThrow();
  });
});
