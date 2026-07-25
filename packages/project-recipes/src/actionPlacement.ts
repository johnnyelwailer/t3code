/**
 * The `action` placement helper now lives in `@t3work/sdk`
 * (`src/t3work-sdk.actionPlacement.ts`) — `@t3work/sdk` is the public authoring import path
 * (Epic 10 §Package Boundaries), so it owns the `define*` implementations and this package
 * re-exports FROM it. Kept as a module (rather than deleted) so existing
 * `@t3tools/project-recipes` importers and the barrel keep resolving.
 */
export { ActionDefinition, defineAction } from "@t3work/sdk/placements";
