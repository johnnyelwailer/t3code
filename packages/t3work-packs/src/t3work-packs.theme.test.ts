import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { decodeThemeDefinition, loadManifestThemes } from "./t3work-packs.index.ts";
import { decodeWorkspacePackManifest } from "./t3work-packs.manifest.ts";

const theme = {
  schemaVersion: 1 as const,
  id: "nexplore",
  name: "Nexplore",
  labels: { appName: "Nexi" },
  colors: { light: { primary: "#f05a00" }, dark: { primary: "#ff6a0a" } },
  density: 0.96,
};

describe("theme definition", () => {
  it("decodes semantic light, dark, density and terminology tokens", () => {
    expect(decodeThemeDefinition(theme)).toMatchObject(theme);
  });

  it("rejects CSS injection and unsafe density", () => {
    expect(() =>
      decodeThemeDefinition({
        ...theme,
        colors: { ...theme.colors, light: { primary: "red;display:none" } },
      }),
    ).toThrow();
    expect(() => decodeThemeDefinition({ ...theme, density: 2 })).toThrow();
  });

  it("loads matching assets and blocks traversal", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3work-theme-"));
    const manifest = (path: string) =>
      decodeWorkspacePackManifest({
        id: "pack",
        version: "1.0.0",
        packApiVersion: 1,
        name: "Pack",
        compatibility: { t3workCore: "0.x" },
        capabilities: ["theme:v1"],
        hashes: {},
        contents: { themes: [{ id: "nexplore", path }] },
      });
    await NodeFSP.writeFile(NodePath.join(root, "theme.json"), JSON.stringify(theme));
    await expect(loadManifestThemes(root, manifest("theme.json"))).resolves.toMatchObject([theme]);
    await expect(loadManifestThemes(root, manifest("../theme.json"))).rejects.toThrow(/escapes/);
  });
});
