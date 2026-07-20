import type { ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

/**
 * Module-singleton seam (same pattern as `t3work-workflowAgentModelPolicy.ts`) that hands
 * workflow-engine child spawning (`thread.turn` / `thread.create`) the same live provider
 * snapshots `t3work.thread.start_child` uses, so cross-provider model selections in ephemeral
 * workflows are validated against the same provider instances rather than blindly mapped.
 *
 * Set once at server boot by `T3workToolBrokerLive` (which already resolves `ProviderRegistry`
 * via `Effect.serviceOption`); left `undefined` when the registry isn't wired into a given
 * server build (e.g. some test/SDK harnesses), in which case consumers fall back to legacy
 * blind mapping.
 */
export type ChildProviderCatalog = () => Promise<ReadonlyArray<ServerProvider>>;

let catalog: ChildProviderCatalog | undefined;

export const setChildProviderCatalog = (next: ChildProviderCatalog | undefined): void => {
  catalog = next;
};

export const getChildProviderCatalog = (): ChildProviderCatalog | undefined => catalog;

/** Boot-time wiring used by `T3workToolBrokerLive`: bind (or clear, when the registry is
 * absent in this build) the catalog from the live `ProviderRegistry` snapshot stream.
 * Last-writer-wins across multiple layer builds in one process — acceptable because a real
 * server builds its runtime layer once; tests should reset via `setChildProviderCatalog`. */
export const bindChildProviderCatalog = (
  registry: { readonly getProviders: Effect.Effect<ReadonlyArray<ServerProvider>> } | undefined,
): void =>
  setChildProviderCatalog(registry ? () => Effect.runPromise(registry.getProviders) : undefined);
