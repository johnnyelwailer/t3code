import { expect, it } from "@effect/vitest";
import { ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";

import { adaptOpenCodeHarnessSnapshot } from "./OpenCodeDriver.ts";

it("gives a pack harness its own identity and hides OpenCode inventory models", () => {
  const snapshot = {
    driver: ProviderDriverKind.make("opencode"),
    models: [
      { slug: "nexplore/coding", name: "Coding", isCustom: true, capabilities: null },
      { slug: "opencode/go", name: "OpenCode Go", isCustom: false, capabilities: null },
      { slug: "opencode/zen", name: "OpenCode Zen", isCustom: false, capabilities: null },
    ],
  } as unknown as ServerProvider;

  const result = adaptOpenCodeHarnessSnapshot(snapshot, ProviderDriverKind.make("nexplore"));

  expect(result.driver).toBe("nexplore");
  expect(result.models.map((model) => model.slug)).toEqual(["nexplore/coding"]);
});
