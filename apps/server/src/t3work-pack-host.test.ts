import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { inspectConfiguredWorkspacePacks, loadPackAppearanceOverlay } from "./t3work-pack-host.ts";

const roots: string[] = [];

afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true }))),
);

describe("workspace pack host inspection", () => {
  it("does nothing unless a pack root is configured", async () => {
    await expect(inspectConfiguredWorkspacePacks(undefined)).resolves.toEqual({
      enabled: false,
      issues: [],
    });
  });

  it("discovers and resolves configured distribution packs", async () => {
    const root = await NodeFSP.mkdtemp("/tmp/t3work-pack-host-");
    roots.push(root);
    const directory = NodePath.join(root, "example");
    await NodeFSP.mkdir(directory);
    await NodeFSP.writeFile(
      NodePath.join(directory, "pack.json"),
      JSON.stringify({
        id: "example",
        name: "Example",
        packApiVersion: 1,
        version: "1.0.0",
        scope: "distribution",
        compatibility: { t3workCore: "*" },
        contents: {},
        capabilities: [],
        hashes: {},
      }),
    );

    const result = await inspectConfiguredWorkspacePacks(root);

    expect(result.issues).toEqual([]);
    expect(result.resolution?.packs.map((pack) => pack.manifest.id)).toEqual(["example"]);
  });

  it("reports an invalid root without throwing", async () => {
    const result = await inspectConfiguredWorkspacePacks("/definitely/missing/t3work-packs");

    expect(result.enabled).toBe(true);
    expect(result.resolution).toBeUndefined();
    expect(result.issues[0]?.directory).toBe("/definitely/missing/t3work-packs");
  });

  it("loads a reviewed active theme from the resolved pack", async () => {
    const root = await NodeFSP.mkdtemp("/tmp/t3work-pack-theme-");
    roots.push(root);
    const directory = NodePath.join(root, "theme-pack");
    await NodeFSP.mkdir(NodePath.join(directory, "themes"), { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(directory, "themes/theme.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "nexplore",
        name: "Nexplore",
        labels: { appName: "Nexi" },
        colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
      }),
    );
    await NodeFSP.writeFile(
      NodePath.join(directory, "pack.json"),
      JSON.stringify({
        id: "theme-pack",
        name: "Theme",
        packApiVersion: 1,
        version: "1.0.0",
        scope: "distribution",
        compatibility: { t3workCore: "*" },
        contents: { themes: [{ id: "nexplore", path: "themes/theme.json" }] },
        capabilities: ["theme:v1"],
        hashes: {},
      }),
    );
    const diagnostic = await inspectConfiguredWorkspacePacks(root);
    await expect(loadPackAppearanceOverlay(diagnostic)).resolves.toMatchObject({
      themeId: "nexplore",
      labels: { appName: "Nexi" },
    });
  });
});
