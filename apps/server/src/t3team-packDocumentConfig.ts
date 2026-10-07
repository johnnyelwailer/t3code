import { stableStringify } from "@t3tools/shared/relaySigning";
import type { PackCollectionsDefinition } from "@t3team/pack-api";

// Immutable boot configuration, shared by compiled-in and runtime pack loading.
let collections: ReadonlyMap<string, PackCollectionsDefinition> = new Map();
export const configuredPackCollections = () => collections;
export const registerPackCollections = (
  definitions: ReadonlyMap<string, PackCollectionsDefinition>,
): void => {
  const next = new Map(collections);
  for (const [id, definition] of definitions) {
    const existing = next.get(id);
    if (existing !== undefined) {
      if (stableStringify(existing) === stableStringify(definition)) continue;
      throw new Error(`Duplicate pack persistence: ${id}`);
    }
    next.set(id, definition);
  }
  collections = next;
};
