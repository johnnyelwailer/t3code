import * as NodeVm from "node:vm";

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

  it("accepts a genuine cross-realm object literal built via node:vm", () => {
    // Unlike the Object.create(Object.create(null)) simulation above, this object literal
    // is built in an actual separate V8 realm (its own global object, its own
    // Object.prototype) via `vm.runInNewContext`, in strict mode.
    const crossRealmLiteral = NodeVm.runInNewContext('"use strict"; ({a: 1})') as object;

    expect(canonicalJsonError(crossRealmLiteral)).toBeUndefined();
  });

  it("rejects a Map instance built via node:vm in a separate realm", () => {
    const crossRealmMap = NodeVm.runInNewContext("new Map()") as object;

    const error = canonicalJsonError(crossRealmMap);
    expect(error).toBeInstanceOf(TypeError);
    expect(error?.message).toContain("Cannot encode a Map as a workflow result");
  });

  it("rejects a Map instance whose prototype has been tampered to null", () => {
    // Documents the hardening added by the toString-tag check: reparenting a Map onto a
    // null prototype defeats a prototype-chain-depth heuristic alone (the chain now ends
    // immediately), but `Object.prototype.toString.call` still reports "[object Map]"
    // because that is driven by the object's internal slot, not its prototype chain.
    const tamperedMap = new Map([["a", 1]]);
    Object.setPrototypeOf(tamperedMap, null);

    const error = canonicalJsonError(tamperedMap);
    expect(error).toBeInstanceOf(TypeError);
    expect(error?.message).toContain("Cannot encode a Map as a workflow result");
  });
});
