/**
 * The placement surface vocabulary is owned by `@t3work/sdk` (the public authoring surface,
 * Epic 10 §Package Boundaries). Re-exported here so the many in-package importers
 * (`recipe.ts`, `runtime.ts`, `discovery.ts`) and the `@t3tools/project-recipes` barrel keep
 * working unchanged.
 */
export { RecipeSurface } from "@t3work/sdk/surface";
