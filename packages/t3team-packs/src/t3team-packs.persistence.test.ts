// @effect-diagnostics nodeBuiltinImport:off - tests exercise actual pack files and symlinks.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { decodeWorkspacePackManifest, loadManifestPersistence } from "./t3team-packs.index.ts";

const items = { maxDocBytes: 1000, retention: "keep", viewWritable: false };
const definition = { items, quotaBytes: 100_000 };
let root: string;
let packDirectory: string;

const manifest = (paths: readonly string[], capabilities: readonly string[] = ["store:v1"]) =>
  decodeWorkspacePackManifest({
    id: "test-pack",
    version: "1.0.0",
    packApiVersion: 1,
    name: "Test Pack",
    compatibility: { t3teamCore: "0.x" },
    contents: { persistence: paths.map((path, index) => ({ id: `collections-${index}`, path })) },
    capabilities,
    hashes: {},
  });

beforeEach(async () => {
  root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3team-persistence-"));
  packDirectory = NodePath.join(root, "pack");
  await NodeFSP.mkdir(packDirectory);
});
afterEach(async () => {
  await NodeFSP.rm(root, { recursive: true, force: true });
});

describe("manifest persistence loading", () => {
  it("loads default-exported collection metadata", async () => {
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "collections.mjs"),
      `export default ${JSON.stringify(definition)};`,
    );
    await expect(
      loadManifestPersistence(packDirectory, manifest(["collections.mjs"])),
    ).resolves.toEqual(definition);
  });

  it("accepts JSON data and combines disjoint collection modules", async () => {
    await NodeFSP.writeFile(NodePath.join(packDirectory, "items.json"), JSON.stringify(definition));
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "notes.json"),
      JSON.stringify({
        notes: { ...items, viewWritable: true },
        quotaBytes: definition.quotaBytes,
      }),
    );
    await expect(
      loadManifestPersistence(packDirectory, manifest(["items.json", "notes.json"])),
    ).resolves.toEqual({ ...definition, notes: { ...items, viewWritable: true } });
  });

  it("requires store:v1 before importing any persistence code", async () => {
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "unsafe.mjs"),
      'throw new Error("executed");',
    );
    await expect(
      loadManifestPersistence(packDirectory, manifest(["unsafe.mjs"], [])),
    ).rejects.toThrow(/without store:v1/);
    await expect(loadManifestPersistence(packDirectory, manifest([], []))).resolves.toBeUndefined();
  });

  it("blocks traversal, absolute paths and symlink escapes", async () => {
    const outside = NodePath.join(root, "outside.json");
    await NodeFSP.writeFile(outside, JSON.stringify(definition));
    await NodeFSP.symlink(outside, NodePath.join(packDirectory, "linked.json"));
    for (const path of ["../outside.json", outside, "linked.json"]) {
      await expect(loadManifestPersistence(packDirectory, manifest([path]))).rejects.toThrow(
        /escapes|relative/,
      );
    }
  });

  it("rejects duplicate collections across persistence refs", async () => {
    await NodeFSP.writeFile(NodePath.join(packDirectory, "items.json"), JSON.stringify(definition));
    await expect(
      loadManifestPersistence(packDirectory, manifest(["items.json", "items.json"])),
    ).rejects.toThrow(/duplicate collection items/);
  });

  it("rejects conflicting pack quotas across modules", async () => {
    await NodeFSP.writeFile(NodePath.join(packDirectory, "items.json"), JSON.stringify(definition));
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "notes.json"),
      JSON.stringify({ notes: items, quotaBytes: 200_000 }),
    );
    await expect(
      loadManifestPersistence(packDirectory, manifest(["items.json", "notes.json"])),
    ).rejects.toThrow(/conflicting quotaBytes/);
  });

  it("validates metadata even when a module bypasses defineCollections", async () => {
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "invalid.mjs"),
      'export default { items: { maxDocBytes: -1, retention: "keep" }, quotaBytes: 100 };',
    );
    await expect(loadManifestPersistence(packDirectory, manifest(["invalid.mjs"]))).rejects.toThrow(
      /positive safe integer/,
    );
    await NodeFSP.writeFile(
      NodePath.join(packDirectory, "empty.mjs"),
      "export const unrelated = 1;",
    );
    await expect(loadManifestPersistence(packDirectory, manifest(["empty.mjs"]))).rejects.toThrow(
      /plain data object/,
    );
  });
});
