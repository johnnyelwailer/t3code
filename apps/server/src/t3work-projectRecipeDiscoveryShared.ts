import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  ProjectRecipeKickoffProgram,
  RecipeSurface,
  type ProjectRecipeManifest,
} from "@t3tools/project-recipes";

export const DEFAULT_VISIBILITY_TIMEOUT_MS = 1_500;

export type RawProjectRecipeManifest = Omit<ProjectRecipeManifest, "scope"> & {
  readonly scope?: string;
};

const ProjectRecipeVisibilityExpressionSchema = Schema.Struct({
  kind: Schema.Literal("expr"),
  expr: Schema.String,
});

const RawProjectRecipeManifestSchema = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  scope: Schema.optional(Schema.String),
  displayName: Schema.String,
  shortDescription: Schema.String,
  icon: Schema.optional(Schema.String),
  surfaces: Schema.Array(RecipeSurface),
  rank: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  visibleWhen: Schema.optional(
    Schema.Union([Schema.String, ProjectRecipeVisibilityExpressionSchema]),
  ),
  actionView: Schema.optional(Schema.String),
  prompt: Schema.String,
  kickoff: Schema.optional(ProjectRecipeKickoffProgram),
  files: Schema.optional(Schema.Array(Schema.String)),
  initScript: Schema.optional(Schema.String),
  workflow: Schema.optional(Schema.String),
  allowedToolGroups: Schema.optional(Schema.Array(Schema.String)),
});

export const decodeRawProjectRecipeManifest = Schema.decodeEffect(
  Schema.fromJsonString(RawProjectRecipeManifestSchema),
);

export function isRelativePath(value: string): boolean {
  return value.startsWith("./") || value.startsWith("../");
}

export function resolveWithinRoot(
  pathService: Path.Path,
  rootPath: string,
  requestedPath: string,
): string {
  const resolvedPath = pathService.resolve(rootPath, requestedPath);
  const relativePath = pathService.relative(rootPath, resolvedPath);
  if (
    relativePath.startsWith("..") ||
    relativePath === ".." ||
    pathService.isAbsolute(relativePath)
  ) {
    throw new Error(`Path '${requestedPath}' resolves outside '${rootPath}'.`);
  }
  return resolvedPath;
}

export function normalizeRecipeManifest(raw: RawProjectRecipeManifest): ProjectRecipeManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Recipe manifest must be an object.");
  }
  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    throw new Error("Recipe manifest must include a non-empty id.");
  }
  if (typeof raw.version !== "string" || raw.version.trim().length === 0) {
    throw new Error("Recipe manifest must include a non-empty version.");
  }
  if (raw.scope !== undefined && raw.scope !== "project") {
    throw new Error("Only project-scoped recipes are supported.");
  }
  if (typeof raw.displayName !== "string" || raw.displayName.trim().length === 0) {
    throw new Error("Recipe manifest must include a non-empty displayName.");
  }
  if (typeof raw.shortDescription !== "string" || raw.shortDescription.trim().length === 0) {
    throw new Error("Recipe manifest must include a non-empty shortDescription.");
  }
  if (!Array.isArray(raw.surfaces) || raw.surfaces.some((surface) => typeof surface !== "string")) {
    throw new Error("Recipe manifest must include surfaces.");
  }
  if (typeof raw.prompt !== "string" || raw.prompt.trim().length === 0) {
    throw new Error("Recipe manifest must include a prompt file path.");
  }
  return {
    ...raw,
    scope: "project",
  } as ProjectRecipeManifest;
}
