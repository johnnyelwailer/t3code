/**
 * The placement surface vocabulary is owned by `@t3team/sdk` (the public authoring surface,
 * Epic 10 §Package Boundaries). Re-exported here so the many in-package importers
 * (`recipe.ts`, `runtime.ts`, `discovery.ts`) and the `@t3tools/project-recipes` barrel keep
 * working unchanged.
 */
export { RecipeSurface } from "@t3team/sdk/surface";
