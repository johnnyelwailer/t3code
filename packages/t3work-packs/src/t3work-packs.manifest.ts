import * as Schema from "effect/Schema";

export const WorkspacePackScope = Schema.Literals([
  "distribution",
  "global",
  "user",
  "project",
  "remote-managed",
]);
export type WorkspacePackScope = typeof WorkspacePackScope.Type;

export const PackModuleRef = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  exports: Schema.optional(Schema.Array(Schema.String)),
});

export const PackAssetRef = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
});
export type PackAssetRef = typeof PackAssetRef.Type;

export const WorkspacePackLock = Schema.Struct({
  target: Schema.String,
  mode: Schema.Literals(["replace", "append", "merge"]),
  value: Schema.Unknown,
});
export type WorkspacePackLock = typeof WorkspacePackLock.Type;

// Explicit shape keeps manifests reviewable and rejects executable configuration blobs.
export const WorkspacePackManifest = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  packApiVersion: Schema.Literal(1),
  name: Schema.String,
  description: Schema.optional(Schema.String),
  publisher: Schema.optional(Schema.String),
  scope: Schema.optional(WorkspacePackScope),
  compatibility: Schema.Struct({
    t3workCore: Schema.String,
    hostCapabilities: Schema.optional(Schema.Array(Schema.String)),
  }),
  entrypoints: Schema.optional(
    Schema.Struct({
      activate: Schema.optional(Schema.String),
      deactivate: Schema.optional(Schema.String),
    }),
  ),
  contents: Schema.Struct({
    connectors: Schema.optional(Schema.Array(PackModuleRef)),
    aiProviders: Schema.optional(Schema.Array(PackAssetRef)),
    tools: Schema.optional(Schema.Array(PackModuleRef)),
    workflows: Schema.optional(Schema.Array(PackModuleRef)),
    recipes: Schema.optional(Schema.Array(PackModuleRef)),
    views: Schema.optional(Schema.Array(PackModuleRef)),
    profiles: Schema.optional(Schema.Array(PackModuleRef)),
    persistence: Schema.optional(Schema.Array(PackModuleRef)),
    projectSyncProviders: Schema.optional(Schema.Array(PackModuleRef)),
    artifactRenderers: Schema.optional(Schema.Array(PackModuleRef)),
    themes: Schema.optional(Schema.Array(PackAssetRef)),
    locales: Schema.optional(Schema.Array(PackAssetRef)),
    policies: Schema.optional(Schema.Array(PackAssetRef)),
  }),
  capabilities: Schema.Array(Schema.String),
  locks: Schema.optional(Schema.Array(WorkspacePackLock)),
  hashes: Schema.Record(Schema.String, Schema.String),
  signature: Schema.optional(Schema.String),
});
export type WorkspacePackManifest = typeof WorkspacePackManifest.Type;

export const decodeWorkspacePackManifest = Schema.decodeUnknownSync(WorkspacePackManifest);

export const defineWorkspacePack = <const T extends WorkspacePackManifest>(manifest: T): T =>
  manifest;
