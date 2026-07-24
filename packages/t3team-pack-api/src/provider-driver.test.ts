import { describe, expect, it } from "vite-plus/test";

import { defineProviderDriver, type PackProviderInstance } from "./index.ts";

const noopInstance = {} as PackProviderInstance;

describe("defineProviderDriver", () => {
  it("returns a well-formed definition unchanged", () => {
    const definition = defineProviderDriver({
      schemaVersion: 1,
      driver: "nexi",
      displayName: "Nexi",
      create: async () => noopInstance,
    });
    expect(definition.driver).toBe("nexi");
    expect(definition.displayName).toBe("Nexi");
  });

  it("rejects a non-identifier driver id", () => {
    expect(() =>
      defineProviderDriver({
        schemaVersion: 1,
        driver: "Nexi Driver",
        displayName: "Nexi",
        create: async () => noopInstance,
      }),
    ).toThrow("lowercase pack identifier");
  });

  it("rejects a missing create function", () => {
    expect(() =>
      defineProviderDriver({
        schemaVersion: 1,
        driver: "nexi",
        displayName: "Nexi",
      } as unknown as Parameters<typeof defineProviderDriver>[0]),
    ).toThrow("must define a create function");
  });
});
