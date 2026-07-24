import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { EnvironmentId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const ExecutionEnvironmentPlatformOs = Schema.Literals([
  "darwin",
  "linux",
  "windows",
  "unknown",
]);
export type ExecutionEnvironmentPlatformOs = typeof ExecutionEnvironmentPlatformOs.Type;

export const ExecutionEnvironmentPlatformArch = Schema.Literals(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = typeof ExecutionEnvironmentPlatformArch.Type;

export const ExecutionEnvironmentPlatform = Schema.Struct({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
});
export type ExecutionEnvironmentPlatform = typeof ExecutionEnvironmentPlatform.Type;

export const ExecutionEnvironmentCapabilities = Schema.Struct({
  repositoryIdentity: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  connectionProbe: Schema.optionalKey(Schema.Boolean),
});
export type ExecutionEnvironmentCapabilities = typeof ExecutionEnvironmentCapabilities.Type;

export const EnvironmentAppearance = Schema.Struct({
  themeId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  productName: Schema.optionalKey(TrimmedNonEmptyString),
  publisher: Schema.optionalKey(TrimmedNonEmptyString),
  labels: Schema.optionalKey(
    Schema.Struct({
      appName: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
  defaultMode: Schema.optionalKey(Schema.Literals(["light", "dark", "system"])),
  brand: Schema.optionalKey(
    Schema.Struct({
      mark: Schema.optionalKey(TrimmedNonEmptyString),
      markDark: Schema.optionalKey(TrimmedNonEmptyString),
      wordmark: Schema.optionalKey(TrimmedNonEmptyString),
      wordmarkDark: Schema.optionalKey(TrimmedNonEmptyString),
      displayFont: Schema.optionalKey(TrimmedNonEmptyString),
    }),
  ),
  colors: Schema.Struct({
    light: Schema.Record(Schema.String, Schema.String),
    dark: Schema.Record(Schema.String, Schema.String),
  }),
  typography: Schema.optionalKey(
    Schema.Struct({
      sans: Schema.optionalKey(Schema.String),
      mono: Schema.optionalKey(Schema.String),
      display: Schema.optionalKey(Schema.String),
    }),
  ),
  shape: Schema.optionalKey(Schema.Struct({ radius: Schema.optionalKey(Schema.String) })),
  density: Schema.optionalKey(Schema.Number),
});
export type EnvironmentAppearance = typeof EnvironmentAppearance.Type;

/**
 * Presentation view of a pack-contributed project-setup profile ("role"),
 * surfaced to the first-run setup wizard. Behavior (recipe weights, communication
 * style) stays server-side and is not part of this client-facing payload.
 */
export const EnvironmentSetupProfile = Schema.Struct({
  id: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  badge: TrimmedNonEmptyString,
  bullets: Schema.Array(TrimmedNonEmptyString),
  category: Schema.Literals(["product", "delivery", "engineering", "operations", "security"]),
  iconDataUrl: Schema.optionalKey(TrimmedNonEmptyString),
  default: Schema.optionalKey(Schema.Boolean),
});
export type EnvironmentSetupProfile = typeof EnvironmentSetupProfile.Type;

export const ExecutionEnvironmentDescriptor = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  capabilities: ExecutionEnvironmentCapabilities,
  appearance: Schema.optionalKey(EnvironmentAppearance),
  setupProfiles: Schema.optionalKey(Schema.Array(EnvironmentSetupProfile)),
});
export type ExecutionEnvironmentDescriptor = typeof ExecutionEnvironmentDescriptor.Type;

export const EnvironmentConnectionState = Schema.Literals([
  "connecting",
  "connected",
  "disconnected",
  "error",
]);
export type EnvironmentConnectionState = typeof EnvironmentConnectionState.Type;

export const RepositoryIdentityLocator = Schema.Struct({
  source: Schema.Literal("git-remote"),
  remoteName: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
});
export type RepositoryIdentityLocator = typeof RepositoryIdentityLocator.Type;

export const RepositoryIdentity = Schema.Struct({
  canonicalKey: TrimmedNonEmptyString,
  locator: RepositoryIdentityLocator,
  rootPath: Schema.optionalKey(TrimmedNonEmptyString),
  displayName: Schema.optionalKey(TrimmedNonEmptyString),
  provider: Schema.optionalKey(TrimmedNonEmptyString),
  owner: Schema.optionalKey(TrimmedNonEmptyString),
  name: Schema.optionalKey(TrimmedNonEmptyString),
});
export type RepositoryIdentity = typeof RepositoryIdentity.Type;

export const ScopedProjectRef = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
});
export type ScopedProjectRef = typeof ScopedProjectRef.Type;

export const ScopedThreadRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type ScopedThreadRef = typeof ScopedThreadRef.Type;

export const ScopedThreadSessionRef = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});
export type ScopedThreadSessionRef = typeof ScopedThreadSessionRef.Type;
