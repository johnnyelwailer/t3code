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

it("a runtime pack overrides the compiled definition of the same pack and keeps the others", () => {
  const compiled = { items: { maxDocBytes: 64, retention: "keep" as const }, quotaBytes: 1024 };
  const runtime = { ...compiled, quotaBytes: 4096 };
  registerCompiledPackPersistence([
    { packId: "override-test", modules: [compiled] },
    { packId: "override-test-compiled-only", modules: [compiled] },
  ]);
  registerPackCollections(
    new Map([
      ["override-test", runtime],
      ["override-test-runtime-only", runtime],
    ]),
    "runtime",
  );
  expect(configuredPackCollections().get("override-test")).toEqual(runtime);
  expect(configuredPackCollections().get("override-test-compiled-only")).toEqual(compiled);
  expect(configuredPackCollections().get("override-test-runtime-only")).toEqual(runtime);
  // A later compiled activation is still the baseline: it never replaces the runtime override.
  registerCompiledPackPersistence([{ packId: "override-test", modules: [compiled] }]);
  expect(configuredPackCollections().get("override-test")).toEqual(runtime);
});
