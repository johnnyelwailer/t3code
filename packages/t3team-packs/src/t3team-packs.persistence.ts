// @effect-diagnostics nodeBuiltinImport:off - loads pack metadata from its real filesystem layout.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { mergePackCollectionsDefinitions, type PackCollectionsDefinition } from "@t3team/pack-api";

import { resolvePackAssetPath } from "./t3team-packs.assetPath.ts";
import type { WorkspacePackManifest } from "./t3team-packs.manifest.ts";

export {
  decodePackCollectionsDefinition,
  defineCollections,
  mergePackCollectionsDefinitions,
  type PackCollectionDefinition,
  type PackCollectionRetention,
  type PackCollectionsDefinition,
} from "@t3team/pack-api";

/** Persistence refs export default plain collection metadata, or point to its JSON form. */
export const loadManifestPersistence = async (
  packDirectory: string,
  manifest: WorkspacePackManifest,
): Promise<PackCollectionsDefinition | undefined> => {
  const references = manifest.contents.persistence ?? [];
  if (references.length === 0) return undefined;
  if (!manifest.capabilities.includes("store:v1")) {
    throw new Error(`Pack ${manifest.id} declares persistence without store:v1 capability`);
  }
  const modules: unknown[] = [];
  for (const reference of references) {
    const path = resolvePackAssetPath(packDirectory, reference.path);
    const source: unknown =
      NodePath.extname(path).toLowerCase() === ".json"
        ? JSON.parse(await NodeFSP.readFile(path, "utf8"))
        : (
            (await import(`${NodeURL.pathToFileURL(path).href}?pack=${manifest.id}`)) as {
              readonly default?: unknown;
            }
          ).default;
    modules.push(source);
  }
  return mergePackCollectionsDefinitions(modules);
};
