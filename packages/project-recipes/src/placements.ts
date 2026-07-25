/**
 * Compatibility subpath. The per-placement `define*` helpers (Epic 19 §Plugin SDK Surface) are
 * owned by `@t3work/sdk` — see `packages/t3work-sdk/src/t3work-sdk.placements.ts`. This subpath
 * stays so `@t3tools/project-recipes/placements` importers keep working; new authoring code
 * should import from `@t3work/sdk` directly.
 */
export { ActionDefinition, defineAction } from "./actionPlacement.ts";
export {
  defineSidecarSection,
  SidecarSectionAction,
  SidecarSectionActionRun,
  SidecarSectionDefaults,
  SidecarSectionDefinition,
} from "./sidecarSection.ts";
export { RecipeSurface } from "./surface.ts";
