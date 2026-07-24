/**
 * The per-placement `define*` helpers (Epic 19 §Plugin SDK Surface), collected behind one
 * light subpath so `@t3work/sdk` can surface them as the single public authoring import path
 * (Epic 10 §Package Boundaries: `@t3work/sdk` is "also the public import path for the recipe
 * and View/placement `define*` helpers") without pulling the whole `project-recipes` barrel
 * (discovery, runtime, kickoff) into the SDK's module graph.
 *
 * Only placements that exist on disk today live here. Adding a new placement is an explicit,
 * type-safe event (Epic 19 §No generic primitive) — ship the helper alongside the placement.
 */
export { defineAction, ActionDefinition } from "./actionPlacement.ts";
export {
  defineSidecarSection,
  SidecarSectionAction,
  SidecarSectionActionRun,
  SidecarSectionDefaults,
  SidecarSectionDefinition,
} from "./sidecarSection.ts";
export { RecipeSurface } from "./surface.ts";
