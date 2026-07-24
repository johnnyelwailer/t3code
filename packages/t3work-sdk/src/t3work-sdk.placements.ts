/**
 * Placement `define*` helpers, surfaced on the SDK's public import path (Epic 16
 * §Implementation Notes: "`@t3work/sdk` … is the public import path for the recipe/plugin-module
 * and View `define*` helpers. Some helpers (e.g. `defineSidecarSection`) currently live in
 * `packages/project-recipes` and are surfaced through `@t3work/sdk`"; Epic 19 §Where helpers
 * live in code).
 *
 * The implementations stay in `packages/project-recipes` — this module is the seam that makes
 * `@t3work/sdk` the one authoring import path. Deep-imports the `@t3tools/project-recipes/placements`
 * subpath, not its barrel, so the SDK does not pick up discovery/runtime/kickoff.
 *
 * SHIPPED helpers cover the placements that exist on disk today: `sidecar.section`
 * (`defineSidecarSection`, Epic 19 status "Built (Phase 5a)") and `action`
 * (`defineAction` — the recipe-launcher action view the quick-starts surface renders).
 * The remaining helpers in the Epic 19 table (`defineWorkItemSection`, `defineDashboardWidget`,
 * `defineNavSection`, `defineHomeBlock`, `defineProjectView`, `defineCommandPaletteContributor`,
 * `defineArtifactRenderer`, `defineConversationCard`, `defineConversationSidecar`,
 * `defineContextAction`, `defineInlineAction`) are intentionally absent: their placements are not
 * built, and Epic 19 §No generic primitive is explicit that a helper ships *with* its placement.
 */
export {
  ActionDefinition,
  defineAction,
  defineSidecarSection,
  RecipeSurface,
  SidecarSectionAction,
  SidecarSectionActionRun,
  SidecarSectionDefaults,
  SidecarSectionDefinition,
} from "@t3tools/project-recipes/placements";
