// @effect-diagnostics nodeBuiltinImport:off - temp directory for the config file.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { NEXI_UPDATE_CONFIG, ensureNexiUpdateConfig } from "./t3team-nexiUpdateConfig.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

describe("ensureNexiUpdateConfig", () => {
  it("creates the config electron-updater needs before it downloads, and is idempotent", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-config-"));
    roots.push(root);
    const directory = NodePath.join(root, "updates");
    const file = ensureNexiUpdateConfig(directory);
    expect(file).toBe(NodePath.join(directory, "app-update.yml"));
    expect(NodeFS.readFileSync(file, "utf8")).toBe(NEXI_UPDATE_CONFIG);
    expect(NEXI_UPDATE_CONFIG).toMatch(/^updaterCacheDirName: nexi-work-updater$/mu);
    expect(ensureNexiUpdateConfig(directory)).toBe(file);
  });

  it("repairs a changed file", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-config-"));
    roots.push(root);
    const file = ensureNexiUpdateConfig(root);
    NodeFS.writeFileSync(file, "provider: github\n");
    ensureNexiUpdateConfig(root);
    expect(NodeFS.readFileSync(file, "utf8")).toBe(NEXI_UPDATE_CONFIG);
  });
});
