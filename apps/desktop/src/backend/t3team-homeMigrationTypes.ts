// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import { DateTime } from "effect";

/**
 * A SQLite file this small has a header and no user data. A real workspace DB
 * is orders of magnitude larger. 8 KiB is two SQLite pages.
 */
export const EMPTY_STATE_DB_MAX_BYTES = 8 * 1024;

export const NEXI_IDENTITY_MARKER_NAME = "nexi-identity.json";
export const MIGRATION_STAMP_NAME = "migration-stamp.json";
export const MIGRATION_STATUS_NAME = "migration-status.json";

export const PROFILE_SKIP_NAMES = new Set([
  "LOCK",
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "lockfile",
]);

export type JoinPath = (first: string, ...segments: string[]) => string;

export function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

export type HomeOwnership = "nexi" | "upstream" | "empty" | "unknown";

export interface NexiIdentityMarker {
  readonly product: "nexi-work";
  readonly productName?: string | undefined;
  readonly appId?: string | undefined;
  readonly at?: string | undefined;
}

export interface MigrationStamp {
  readonly from: string;
  readonly to: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly at: string;
  readonly kind: "home" | "profile" | "symlink-restore";
}

export interface MigrationStatus {
  readonly at: string;
  readonly home?: "ok" | "skipped-upstream" | "skipped-existing" | "verify-failed" | "fresh";
  readonly profile?: "ok" | "skipped-upstream" | "skipped-existing" | "verify-failed" | "fresh";
  readonly safeStorage?: "copied" | "windows-local-state" | "unknown" | "not-needed";
  readonly warning?: string | undefined;
}
