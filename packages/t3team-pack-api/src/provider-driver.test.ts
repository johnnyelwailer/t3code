import { describe, expect, it } from "vite-plus/test";

import { defineProviderDriver, type PackProviderInstance } from "./index.ts";

const noopInstance = {} as PackProviderInstance;

describe("defineProviderDriver", () => {
  it("returns a well-formed definition unchanged", () => {
    const definition = defineProviderDriver({
      schemaVersion: 2,
      driver: "example",
      displayName: "Example",
      create: async () => noopInstance,
    });
    expect(definition.driver).toBe("example");
    expect(definition.displayName).toBe("Example");
  });

  it("rejects a non-identifier driver id", () => {
    expect(() =>
      defineProviderDriver({
        schemaVersion: 2,
        driver: "Example Driver",
        displayName: "Example",
        create: async () => noopInstance,
      }),
    ).toThrow("lowercase pack identifier");
  });

  it("rejects a schemaVersion 1 (V1 adapter) definition", () => {
    expect(() =>
      defineProviderDriver({
        schemaVersion: 1,
        driver: "example",
        displayName: "Example",
        create: async () => noopInstance,
      } as unknown as Parameters<typeof defineProviderDriver>[0]),
    ).toThrow("schemaVersion 2");
  });

  it("rejects a missing create function", () => {
    expect(() =>
      defineProviderDriver({
        schemaVersion: 2,
        driver: "example",
        displayName: "Example",
      } as unknown as Parameters<typeof defineProviderDriver>[0]),
    ).toThrow("must define a create function");
  });
});
