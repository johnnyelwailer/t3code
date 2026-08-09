import { describe, expect, it } from "vite-plus/test";

import { deterministicGlobals } from "./globals.ts";

describe("@runbook/ts deterministic globals", () => {
  it("routes ambient clock and entropy reads through the supplied source", () => {
    const source = {
      now: () => 1_700_000_000_123,
      random: () => 0.25,
      uuid: () => "00000000-0000-0000-0000-000000000001",
    };
    const globals = deterministicGlobals(source);
    const DateValue = globals["Date"] as DateConstructor;
    const MathValue = globals["Math"] as typeof Math;
    const crypto = globals["crypto"] as { readonly randomUUID: () => string };

    expect(DateValue.now()).toBe(source.now());
    expect(new DateValue().getTime()).toBe(source.now());
    expect(MathValue.random()).toBe(source.random());
    expect(crypto.randomUUID()).toBe(source.uuid());
  });
});
