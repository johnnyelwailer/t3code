/* oxlint-disable t3code/no-inline-schema-compile -- Existing merged lint debt; keep green while preserving behavior. */
import * as Schema from "effect/Schema";

import { RecipeSurface } from "./surface.ts";

export const ActionRecipeSurface = RecipeSurface;
export type ActionRecipeSurface = typeof ActionRecipeSurface.Type;

const SidecarSectionActionInput = Schema.Record(Schema.String, Schema.Unknown);

export const SidecarSectionToolActionRun = Schema.Struct({
  kind: Schema.Literal("tool"),
  toolName: Schema.String,
  input: Schema.optional(SidecarSectionActionInput),
});
export type SidecarSectionToolActionRun = typeof SidecarSectionToolActionRun.Type;

export const SidecarSectionScriptActionRun = Schema.Struct({
  kind: Schema.Literal("script"),
  module: Schema.String,
  input: Schema.optional(SidecarSectionActionInput),
});
export type SidecarSectionScriptActionRun = typeof SidecarSectionScriptActionRun.Type;

export const SidecarSectionActionRun = Schema.Union([
  SidecarSectionToolActionRun,
  SidecarSectionScriptActionRun,
]);
export type SidecarSectionActionRun = typeof SidecarSectionActionRun.Type;

export const SidecarSectionAction = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  icon: Schema.optional(Schema.String),
  run: SidecarSectionActionRun,
});
export type SidecarSectionAction = typeof SidecarSectionAction.Type;

export const SidecarSectionDefaults = Schema.Struct({
  collapsed: Schema.optional(Schema.Boolean),
  visible: Schema.optional(Schema.Boolean),
});
export type SidecarSectionDefaults = typeof SidecarSectionDefaults.Type;

export const SidecarSectionDefinition = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  title: Schema.String,
  shortDescription: Schema.optional(Schema.String),
  surfaces: Schema.Array(ActionRecipeSurface),
  component: Schema.String,
  allowedToolGroups: Schema.optional(Schema.Array(Schema.String)),
  defaults: Schema.optional(SidecarSectionDefaults),
});
type SidecarSectionDefinitionCore = typeof SidecarSectionDefinition.Type;

export type SidecarSectionDefinition = SidecarSectionDefinitionCore & {
  readonly itemActions?: ((item: unknown) => ReadonlyArray<SidecarSectionAction>) | undefined;
  readonly sectionActions?: (() => ReadonlyArray<SidecarSectionAction>) | undefined;
};

// Stage-1 trusted sections bind to a registered React component key here.
// This helper re-homes into the dedicated SDK package when that surface lands.
export function defineSidecarSection(
  definition: SidecarSectionDefinition,
): SidecarSectionDefinition {
  const { itemActions, sectionActions, ...serializableDefinition } = definition;
  const validatedDefinition = Schema.decodeSync(SidecarSectionDefinition)(serializableDefinition);

  return {
    ...validatedDefinition,
    ...(itemActions ? { itemActions } : {}),
    ...(sectionActions ? { sectionActions } : {}),
  };
}
