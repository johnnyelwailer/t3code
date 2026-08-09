/**
 * Placement `define*` helpers, surfaced on the SDK's public import path (Epic 16
 * §Implementation Notes: "`@t3team/sdk` … is the public import path for the recipe/plugin-module
 * and View `define*` helpers"; Epic 19 §Where helpers live in code).
 *
 * The implementations now live HERE, in the SDK — the public authoring surface (Epic 10
 * §Package Boundaries). `@t3tools/project-recipes` re-exports them from `@t3team/sdk` for its
 * existing importers, so the dependency runs one way only: project-recipes → SDK. (Until this
 * module owned them, the SDK deep-imported `@t3tools/project-recipes/placements`, which inverted
 * that direction and forced consumers to resolve project-recipes just to import the SDK.)
 *
 * SHIPPED helpers cover the placements that exist on disk today: `sidecar.section`
 * (`defineSidecarSection`, Epic 19 status "Built (Phase 5a)") and `action`
 * (`defineAction` — the recipe-launcher action view the quick-starts surface renders; the
 * bundled skill-pack recipes run their views through it).
 * The remaining helpers in the Epic 19 table (`defineWorkItemSection`, `defineDashboardWidget`,
 * `defineNavSection`, `defineHomeBlock`, `defineProjectView`, `defineCommandPaletteContributor`,
 * `defineArtifactRenderer`, `defineConversationCard`, `defineConversationSidecar`,
 * `defineContextAction`, `defineInlineAction`) are intentionally absent: their placements are not
 * built, and Epic 19 §No generic primitive is explicit that a helper ships *with* its placement.
 */
export { ActionDefinition, defineAction } from "./t3team-sdk.actionPlacement.ts";
export {
  ActionRecipeSurface,
  defineSidecarSection,
  SidecarSectionAction,
  SidecarSectionActionRun,
  SidecarSectionDefaults,
  SidecarSectionDefinition,
  SidecarSectionScriptActionRun,
  SidecarSectionToolActionRun,
} from "./t3team-sdk.sidecarSection.ts";
export { RecipeSurface } from "./t3team-sdk.surface.ts";
