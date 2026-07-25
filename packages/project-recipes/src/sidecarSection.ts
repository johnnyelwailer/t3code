/**
 * The `sidecar.section` placement helper now lives in `@t3work/sdk`
 * (`src/t3work-sdk.sidecarSection.ts`) — `@t3work/sdk` is the public authoring import path
 * (Epic 10 §Package Boundaries), so it owns the `define*` implementations and this package
 * re-exports FROM it for existing importers (`@t3tools/t3work-skill-packs`, `apps/web`).
 */
export {
  ActionRecipeSurface,
  defineSidecarSection,
  SidecarSectionAction,
  SidecarSectionActionRun,
  SidecarSectionDefaults,
  SidecarSectionDefinition,
  SidecarSectionScriptActionRun,
  SidecarSectionToolActionRun,
} from "@t3work/sdk/placements";
