import { expect, it } from "vite-plus/test";
import { configuredPackCollections, registerPackCollections } from "./t3team-packDocumentConfig.ts";
import { registerCompiledPackPersistence } from "./t3team-compiledPackPersistence.ts";

it("repeated compiled activation is idempotent and conflicting registration is atomic", () => {
  const definition = { items: { maxDocBytes: 64, retention: "keep" as const }, quotaBytes: 1024 };
  const input = [{ packId: "compiled-config-test", modules: [definition] }];
  registerCompiledPackPersistence(input);
  registerCompiledPackPersistence(input);
  expect(configuredPackCollections().get("compiled-config-test")).toEqual(definition);
  const prior = configuredPackCollections();
  expect(() =>
    registerPackCollections(
      new Map([
        ["would-partially-register", definition],
        ["compiled-config-test", { ...definition, quotaBytes: 2048 }],
      ]),
    ),
  ).toThrow("Duplicate");
  expect(configuredPackCollections()).toBe(prior);
  expect(configuredPackCollections().has("would-partially-register")).toBe(false);
});
