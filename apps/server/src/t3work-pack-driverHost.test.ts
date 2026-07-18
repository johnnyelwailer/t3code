import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { loadPackProviderOverlay } from "./t3work-pack-host.ts";

const roots: string[] = [];

afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true }))),
);

const writePack = async (input: {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly activate: string;
}): Promise<{ directory: string; manifest: Record<string, unknown> }> => {
  const root = await NodeFSP.mkdtemp("/tmp/t3work-pack-driver-");
  roots.push(root);
  const directory = NodePath.join(root, input.id);
  await NodeFSP.mkdir(directory);
  await NodeFSP.writeFile(NodePath.join(directory, "activate.mjs"), input.activate);
  return {
    directory,
    manifest: {
      id: input.id,
      version: "1.0.0",
      packApiVersion: 1,
      name: input.id,
      compatibility: { t3workCore: "*" },
      contents: {},
      entrypoints: { activate: "activate.mjs" },
      capabilities: input.capabilities,
      hashes: {},
    },
  };
};

const DRIVER_ACTIVATE = (driver: string) =>
  `export default ({ defineProviderDriver }) => defineProviderDriver({
    schemaVersion: 1, driver: ${JSON.stringify(driver)}, displayName: "Driver ${driver}",
    create: async () => ({})
  });`;

const overlayInput = (
  packs: ReadonlyArray<{ directory: string; manifest: Record<string, unknown> }>,
) =>
  ({
    enabled: true,
    issues: [],
    resolution: { packs, locks: {}, diagnostics: [] },
  }) as unknown as Parameters<typeof loadPackProviderOverlay>[0];

describe("loadPackProviderOverlay provider drivers", () => {
  it("collects an executable driver definition with the declared capability", async () => {
    const pack = await writePack({
      id: "nexipack",
      capabilities: ["provider-driver:nexidriver"],
      activate: DRIVER_ACTIVATE("nexidriver"),
    });
    const overlay = await loadPackProviderOverlay(overlayInput([pack]));
    expect(overlay.driverDefinitions.has("nexidriver")).toBe(true);
    expect(overlay.driverDefinitions.get("nexidriver")?.displayName).toBe("Driver nexidriver");
  });

  it("rejects a driver registered without its provider-driver capability", async () => {
    const pack = await writePack({
      id: "nocap",
      capabilities: [],
      activate: DRIVER_ACTIVATE("nexidriver"),
    });
    await expect(loadPackProviderOverlay(overlayInput([pack]))).rejects.toThrow(
      "without provider-driver:nexidriver capability",
    );
  });

  it("rejects a driver id that collides with a built-in driver", async () => {
    const pack = await writePack({
      id: "collide",
      capabilities: ["provider-driver:codex"],
      activate: DRIVER_ACTIVATE("codex"),
    });
    await expect(loadPackProviderOverlay(overlayInput([pack]))).rejects.toThrow(
      "collides with a built-in driver",
    );
  });

  it("rejects duplicate driver ids across packs", async () => {
    const packA = await writePack({
      id: "dupa",
      capabilities: ["provider-driver:dup"],
      activate: DRIVER_ACTIVATE("dup"),
    });
    const packB = await writePack({
      id: "dupb",
      capabilities: ["provider-driver:dup"],
      activate: DRIVER_ACTIVATE("dup"),
    });
    await expect(loadPackProviderOverlay(overlayInput([packA, packB]))).rejects.toThrow(
      "Duplicate provider driver id dup",
    );
  });
});
