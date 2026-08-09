/**
 * The `sidecar.section` placement helper now lives in `@t3team/sdk`
 * (`src/t3team-sdk.sidecarSection.ts`) — `@t3team/sdk` is the public authoring import path
 * (Epic 10 §Package Boundaries), so it owns the `define*` implementations and this package
 * re-exports FROM it for existing importers (`@t3tools/t3team-skill-packs`, `apps/web`).
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
} from "@t3team/sdk/placements";
