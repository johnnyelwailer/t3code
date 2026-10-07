// @effect-diagnostics nodeBuiltinImport:off - build-time reader; runs inside the bundler, outside any Effect runtime.
/**
 * The packs a distribution compiles in, and their web entries (`contents.views`).
 *
 * `distribution.json` may list `packs` — pack directories relative to the distribution directory.
 * Without it, the distribution directory is itself the one pack. Read at BUILD time by the web
 * plugin that generates `@t3code/distribution-web`; every problem is a build error, because a view
 * that silently drops out of the build reads as "declared, so it must work".
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { resolvePackAssetPath } from "./t3team-packs.assetPath.ts";
import { decodeWorkspacePackManifest } from "./t3team-packs.manifest.ts";

const fail = (message: string): never => {
  throw new Error(`[t3code/distribution-web] ${message}`);
};

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(NodeFS.readFileSync(path, "utf8"));
  } catch (cause) {
    return fail(`cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
};

/** Absolute pack directories of the distribution, in `packs[]` order. */
export function readDistributionPackDirs(distributionDir: string): ReadonlyArray<string> {
  const manifest = readJson(NodePath.join(distributionDir, "distribution.json")) as {
    readonly packs?: unknown;
  };
  if (manifest.packs === undefined) return [NodePath.resolve(distributionDir)];
  if (!Array.isArray(manifest.packs) || !manifest.packs.every((dir) => typeof dir === "string")) {
    return fail(`distribution.json "packs" must be an array of pack directories`);
  }
  return manifest.packs.map((dir: string) => NodePath.resolve(distributionDir, dir));
}

/** One pack web entry to compile in. */
export interface DistributionWebEntry {
  readonly packId: string;
  readonly packDir: string;
  readonly entryPath: string;
}

/** The web entries of every pack the distribution compiles in. */
export function readDistributionWebEntries(
  distributionDir: string,
): ReadonlyArray<DistributionWebEntry> {
  const entries: DistributionWebEntry[] = [];
  const packIds = new Set<string>();
  for (const packDir of readDistributionPackDirs(distributionDir)) {
    const manifestPath = NodePath.join(packDir, "pack.json");
    let manifest: ReturnType<typeof decodeWorkspacePackManifest>;
    try {
      manifest = decodeWorkspacePackManifest(readJson(manifestPath));
    } catch (cause) {
      return fail(`${manifestPath} is not a valid pack manifest: ${String(cause)}`);
    }
    if (packIds.has(manifest.id)) fail(`pack id "${manifest.id}" is listed twice`);
    packIds.add(manifest.id);
    const views = manifest.contents.views ?? [];
    if (views.length > 0 && !manifest.capabilities.includes("view:v1")) {
      fail(`pack ${manifest.id} declares contents.views without the view:v1 capability`);
    }
    for (const view of views) {
      let entryPath: string;
      try {
        entryPath = resolvePackAssetPath(packDir, view.path);
      } catch (cause) {
        return fail(`pack ${manifest.id} view ${view.id}: ${String(cause)}`);
      }
      if (!NodeFS.existsSync(entryPath))
        fail(`pack ${manifest.id} view entry not found: ${entryPath}`);
      entries.push({ packId: manifest.id, packDir, entryPath });
    }
  }
  return entries;
}
