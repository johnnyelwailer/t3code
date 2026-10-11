import { mergePackCollectionsDefinitions, type PackCollectionsDefinition } from "@t3team/pack-api";
import { registerPackCollections } from "./t3team-packDocumentConfig.ts";

export function registerCompiledPackPersistence(
  registrations: ReadonlyArray<{
    readonly packId: string;
    readonly modules: ReadonlyArray<unknown>;
  }>,
): void {
  const packs = new Map<string, PackCollectionsDefinition>();
  for (const { packId, modules } of registrations) {
    if (packs.has(packId)) throw new Error(`Duplicate persistence pack ${packId}`);
    packs.set(packId, mergePackCollectionsDefinitions(modules));
  }
  registerPackCollections(packs, "compiled");
}
