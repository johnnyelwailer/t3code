// @effect-diagnostics nodeBuiltinImport:off - boot loader tests use isolated real pack directories.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { decodeWorkspacePackManifest, type LoadedWorkspacePack } from "@t3team/packs";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { loadPackPersistence } from "./t3team-packPersistence.ts";

let root: string;
const diagnostic = (packs: readonly LoadedWorkspacePack[]) => ({
  enabled: true,
  issues: [],
  resolution: { packs, locks: {}, diagnostics: [] },
});

const pack = async (id: string, maxDocBytes: number): Promise<LoadedWorkspacePack> => {
  const directory = NodePath.join(root, id);
  await NodeFSP.mkdir(directory);
  await NodeFSP.writeFile(
    NodePath.join(directory, "collections.json"),
    JSON.stringify({ items: { maxDocBytes, retention: "keep" }, quotaBytes: 100_000 }),
  );
  return {
    directory,
    manifest: decodeWorkspacePackManifest({
      id,
      version: "1.0.0",
      packApiVersion: 1,
      name: id,
      compatibility: { t3teamCore: "0.x" },
      contents: { persistence: [{ id: "collections", path: "collections.json" }] },
      capabilities: ["store:v1"],
      hashes: {},
    }),
  };
};

beforeEach(async () => {
  root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3team-packPersistence-"));
});
afterEach(async () => {
  await NodeFSP.rm(root, { recursive: true, force: true });
});

describe("pack persistence host loading", () => {
  it("keeps same-named collections scoped to their registering packs", async () => {
    const a = await pack("pack-a", 1000);
    const b = await pack("pack-b", 2000);
    const definitions = await loadPackPersistence(diagnostic([a, b]));
    expect(definitions.get("pack-a")?.items).toEqual({ maxDocBytes: 1000, retention: "keep" });
    expect(definitions.get("pack-b")?.items).toEqual({ maxDocBytes: 2000, retention: "keep" });
    expect(definitions.get("pack-c")).toBeUndefined();
  });

  it("rejects duplicate pack registrations instead of silently replacing their caps", async () => {
    const a = await pack("pack-a", 1000);
    await expect(loadPackPersistence(diagnostic([a, a]))).rejects.toThrow(
      /Duplicate persistence pack/,
    );
  });

  it("returns no registrations when pack discovery is disabled", async () => {
    const definitions = await loadPackPersistence({ enabled: false, issues: [] });
    expect(definitions.size).toBe(0);
  });
});
