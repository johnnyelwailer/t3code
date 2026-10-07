import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { expect, it } from "vite-plus/test";
import { mergePackCollectionsDefinitions } from "@t3team/pack-api";
import { distributionPersistenceModule } from "./t3team-distributionPersistenceModule.ts";

const metadata = { items: { maxDocBytes: 64, retention: "keep" }, quotaBytes: 1024 };
const manifest = {
  id: "acme",
  name: "Acme",
  version: "1",
  packApiVersion: 1,
  compatibility: { t3teamCore: "*" },
  capabilities: ["store:v1"],
  hashes: {},
  contents: { persistence: [{ id: "collections", path: "collections.mjs" }] },
};

it("bundles a pack's plain collection metadata into the distribution module", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t1-compiled-persistence-"));
  try {
    await NodeFSP.writeFile(NodePath.join(root, "pack.json"), JSON.stringify(manifest));
    await NodeFSP.writeFile(
      NodePath.join(root, "collections.mjs"),
      `export default ${JSON.stringify(metadata)};`,
    );
    const module = NodePath.join(root, "compiled.mjs");
    await NodeFSP.writeFile(module, distributionPersistenceModule(root));
    const loaded = await import(NodeURL.pathToFileURL(module).href);
    expect(loaded.distributionPersistence[0].packId).toBe("acme");
    expect(mergePackCollectionsDefinitions(loaded.distributionPersistence[0].modules)).toEqual(
      metadata,
    );
    await NodeFSP.writeFile(
      NodePath.join(root, "pack.json"),
      JSON.stringify({ ...manifest, capabilities: [] }),
    );
    expect(() => distributionPersistenceModule(root)).toThrow("store:v1");
    await NodeFSP.writeFile(
      NodePath.join(root, "pack.json"),
      JSON.stringify({
        ...manifest,
        contents: { persistence: [{ id: "collections", path: "../outside.mjs" }] },
      }),
    );
    expect(() => distributionPersistenceModule(root)).toThrow("escapes");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("handles a distribution without a pack manifest and supports an explicit pack set", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t1-pack-set-"));
  try {
    expect(distributionPersistenceModule(root)).toContain("distributionPersistence = []");
    await NodeFSP.mkdir(NodePath.join(root, "pack"));
    await NodeFSP.writeFile(NodePath.join(root, "pack", "pack.json"), JSON.stringify(manifest));
    expect(distributionPersistenceModule(root, ["pack"])).toContain('packId: "acme"');
    expect(() => distributionPersistenceModule(root, ["pack", "pack"])).toThrow("Duplicate");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
