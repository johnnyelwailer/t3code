import { stableStringify } from "@t3tools/shared/relaySigning";
import type { PackCollectionsDefinition } from "@t3team/pack-api";

type Definitions = ReadonlyMap<string, PackCollectionsDefinition>;
/** The compiled-in distribution is the baseline; a runtime pack overrides it for its own pack id. */
type PackCollectionsSource = "compiled" | "runtime";

// Immutable boot configuration, shared by compiled-in and runtime pack loading.
const layers: Record<PackCollectionsSource, Definitions> = {
  compiled: new Map(),
  runtime: new Map(),
};
let collections: Definitions = new Map();
export const configuredPackCollections = () => collections;

/**
 * Registers one source's definitions atomically. Re-registering an identical definition is a no-op;
 * a different definition for a pack id the same source already registered is a conflict.
 */
export const registerPackCollections = (
  definitions: Definitions,
  source: PackCollectionsSource,
): void => {
  const next = new Map(layers[source]);
  for (const [id, definition] of definitions) {
    const existing = next.get(id);
    if (existing !== undefined) {
      if (stableStringify(existing) === stableStringify(definition)) continue;
      throw new Error(`Duplicate pack persistence: ${id}`);
    }
    next.set(id, definition);
  }
  layers[source] = next;
  collections = new Map([...layers.compiled, ...layers.runtime]);
};
