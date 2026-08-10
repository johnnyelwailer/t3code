import { describe, expect, it } from "vite-plus/test";

import { canonicalJsonError } from "./canonicalJson.ts";

describe("@runbook/core canonicalJson strict mode", () => {
  it("accepts a plain object whose prototype comes from another realm", () => {
    // Simulates a cross-realm object literal: workflow bodies run in their own realm, so
    // their `{}` literals carry that realm's Object.prototype, not this module's. The
    // defining trait of a plain object survives the realm boundary though — its prototype's
    // own prototype is null, unlike a class/Map/Set instance whose chain is deeper.
    const foreignProto: object = Object.create(null);
    const crossRealmPlainObject: object = Object.create(foreignProto);
    (crossRealmPlainObject as Record<string, unknown>).ok = true;

    expect(canonicalJsonError(crossRealmPlainObject)).toBeUndefined();
  });

  it("still rejects a Map instance", () => {
    const error = canonicalJsonError(new Map([["a", 1]]));
    expect(error).toBeInstanceOf(TypeError);
    expect(error?.message).toContain("Cannot encode a Map as a workflow result");
  });

  it("still rejects a class instance", () => {
    class Ticket {
      id = "t-1";
    }
    const error = canonicalJsonError(new Ticket());
    expect(error).toBeInstanceOf(TypeError);
    expect(error?.message).toContain("Cannot encode a Ticket as a workflow result");
  });
});
