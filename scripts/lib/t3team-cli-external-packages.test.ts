import { assert, describe, it } from "@effect/vitest";

import {
  isRuntimeExternalCliDependency,
  selectCliRuntimeExternalDependencies,
} from "./cli-external-packages.ts";

describe("fork runtime externals", () => {
  // The wasm loader reads a sibling file at init, so inlining it into the bundle breaks image reads.
  it("keeps photon-node external so its wasm stays next to the loader", () => {
    assert.strictEqual(isRuntimeExternalCliDependency("@silvia-odwyer/photon-node"), true);
    assert.deepStrictEqual(
      selectCliRuntimeExternalDependencies({
        "@silvia-odwyer/photon-node": "0.3.4",
        effect: "3.0.0",
      }),
      { "@silvia-odwyer/photon-node": "0.3.4" },
    );
  });
});
