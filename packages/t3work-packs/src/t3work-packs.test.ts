import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  decodeWorkspacePackManifest,
  discoverLocalWorkspacePacks,
  resolveWorkspacePacks,
} from "./t3work-packs.index.ts";
import type { LoadedWorkspacePack, WorkspacePackScope } from "./t3work-packs.index.ts";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true }))),
);

const manifest = (id: string, scope: WorkspacePackScope = "distribution") => ({
  id,
  version: "1.0.0",
  packApiVersion: 1 as const,
  name: id,
  scope,
  compatibility: { t3workCore: "0.x" },
  contents: {},
  capabilities: [],
  hashes: {},
});

const loaded = (
  id: string,
  scope: WorkspacePackScope,
  locks?: readonly { target: string; mode: "replace" | "append" | "merge"; value: unknown }[],
): LoadedWorkspacePack => ({
  directory: `/packs/${id}-${scope}`,
  manifest: decodeWorkspacePackManifest({ ...manifest(id, scope), locks }),
});

describe("pack manifest", () => {
  it("accepts API v1 and rejects a future API version", () => {
    expect(decodeWorkspacePackManifest(manifest("community")).id).toBe("community");
    expect(() => decodeWorkspacePackManifest({ ...manifest("future"), packApiVersion: 2 })).toThrow(
      /packApiVersion/,
    );
  });
});

describe("local discovery", () => {
  it("loads valid child packs and reports invalid children", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3work-packs-"));
    roots.push(root);
    await Promise.all([
      NodeFSP.mkdir(NodePath.join(root, "good")),
      NodeFSP.mkdir(NodePath.join(root, "broken")),
    ]);
    await Promise.all([
      NodeFSP.writeFile(NodePath.join(root, "good", "pack.json"), JSON.stringify(manifest("good"))),
      NodeFSP.writeFile(NodePath.join(root, "broken", "pack.json"), "not-json"),
    ]);

    const result = await discoverLocalWorkspacePacks(root);

    expect(result.packs.map((pack) => pack.manifest.id)).toEqual(["good"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.directory).toBe(NodePath.join(root, "broken"));
  });
});

describe("pack resolution", () => {
  it("selects higher scopes and explains effective locks deterministically", () => {
    const distribution = loaded("company", "distribution", [
      { target: "aiProviders.allowed", mode: "replace", value: ["local"] },
    ]);
    const managed = loaded("company", "remote-managed", [
      { target: "aiProviders.allowed", mode: "replace", value: ["enterprise"] },
    ]);

    const result = resolveWorkspacePacks([managed, distribution, loaded("project", "project")]);

    expect(result.packs.map((pack) => pack.manifest.id)).toEqual(["project", "company"]);
    expect(result.locks["aiProviders.allowed"]?.value).toEqual(["enterprise"]);
    expect(result.locks["aiProviders.allowed"]?.source.scope).toBe("remote-managed");
    expect(result.diagnostics).toContain(
      "Pack company@1.0.0 replaced by company@1.0.0 (remote-managed).",
    );
  });
});
