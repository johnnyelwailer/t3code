import { loadManifestPersistence, type PackCollectionsDefinition } from "@t3team/packs";

import type { WorkspacePackHostDiagnostic } from "./t3team-pack-host.ts";

/** Resolves persistence once at boot; definitions remain bound to their registering pack. */
export const loadPackPersistence = async (
  diagnostic: WorkspacePackHostDiagnostic,
): Promise<ReadonlyMap<string, PackCollectionsDefinition>> => {
  const definitions = new Map<string, PackCollectionsDefinition>();
  for (const pack of diagnostic.resolution?.packs ?? []) {
    const definition = await loadManifestPersistence(pack.directory, pack.manifest);
    if (!definition) continue;
    if (definitions.has(pack.manifest.id)) {
      throw new Error(`Duplicate persistence pack ${pack.manifest.id}`);
    }
    definitions.set(pack.manifest.id, definition);
  }
  return definitions;
};
