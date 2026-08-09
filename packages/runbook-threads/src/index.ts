/**
 * Host-neutral contracts for workflow threads and agent turns.
 *
 * The package deliberately contains no broker, provider, UI, registry, or persistence code. A
 * host implements these contracts and may specialize the capability type parameter while the
 * workflow authoring surface remains `thread.*`, `spawnThread`, and `agent`.
 */

export * from "./models.ts";
export * from "./types.ts";
export * from "./capabilities.ts";
export * from "./defaults.ts";
export * from "./attachments.ts";
export * from "./affordance.ts";
export * from "./schemaSketch.ts";
export * from "./schemaDescribe.ts";
export * from "./askRender.ts";
export * from "./askVerb.ts";
export * from "./modelCascade.ts";
export * from "./broker.ts";
export * from "./primitives.ts";
export * from "./titles.ts";
