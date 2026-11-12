// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { DateTime } from "effect";

/**
 * A SQLite file this small has a header and no user data. A real workspace DB
 * is orders of magnitude larger. 8 KiB is two SQLite pages.
 */
export const EMPTY_STATE_DB_MAX_BYTES = 8 * 1024;

export const NEXI_IDENTITY_MARKER_NAME = "nexi-identity.json";
export const MIGRATION_STAMP_NAME = "migration-stamp.json";
export const MIGRATION_STATUS_NAME = "migration-status.json";

export const SAFE_STORAGE_SIGN_IN_WARNING =
  "Nexi Work could not carry your encrypted sign-in onto this app identity. Your projects and threads are intact. Please sign in again.";

const PROFILE_SKIP_NAMES = new Set([
  "LOCK",
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "lockfile",
]);

export type JoinPath = (first: string, ...segments: string[]) => string;

export function nowIsoForMigration(): string {
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
  readonly safeStorage?:
    | "copied"
    | "windows-local-state"
    | "unknown"
    | "not-needed"
    | "pending"
    | "verified"
    | "reencrypted"
    | "failed"
    | "unavailable";
  readonly warning?: string | undefined;
  readonly warningShown?: boolean | undefined;
}

export function fileSizeOrZero(candidate: string): number {
  try {
    return NodeFS.statSync(candidate).size;
  } catch {
    return 0;
  }
}

export const stateBytes = (userdataDir: string, join: JoinPath): number =>
  Math.max(
    fileSizeOrZero(join(userdataDir, "statev2.sqlite")),
    fileSizeOrZero(join(userdataDir, "state.sqlite")),
  );

export function isRealStateDb(userdataDir: string, join: JoinPath): boolean {
  return stateBytes(userdataDir, join) > EMPTY_STATE_DB_MAX_BYTES;
}

export function isNexiUserDataDirName(name: string): boolean {
  const base = name.trim().toLowerCase();
  return base === "nexi-work" || base.startsWith("nexi-work-");
}

function isUpstreamHomeDirName(name: string): boolean {
  const base = NodePath.basename(name);
  return base === ".t3" || base === ".t3code";
}

function isUpstreamProfileDirName(name: string): boolean {
  const base = NodePath.basename(name);
  return (
    base === "t3code-v2" ||
    base === "t3code-dev" ||
    base === "t3code" ||
    base === "T3 Code (Alpha)" ||
    base === "T3 Code (Dev)"
  );
}

function markerPaths(dir: string, join: JoinPath): readonly string[] {
  return [join(dir, NEXI_IDENTITY_MARKER_NAME), join(dir, "userdata", NEXI_IDENTITY_MARKER_NAME)];
}

export function readNexiIdentityMarker(
  dir: string,
  join: JoinPath,
): NexiIdentityMarker | undefined {
  for (const candidate of markerPaths(dir, join)) {
    try {
      const parsed = JSON.parse(NodeFS.readFileSync(candidate, "utf8")) as NexiIdentityMarker;
      if (parsed.product === "nexi-work") return parsed;
      if (typeof parsed.appId === "string" && parsed.appId.startsWith("ch.nexplore.nexi.work")) {
        return { ...parsed, product: "nexi-work" };
      }
      if (typeof parsed.productName === "string" && parsed.productName.startsWith("Nexi Work")) {
        return { ...parsed, product: "nexi-work" };
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function writeNexiIdentityMarker(
  dir: string,
  marker: NexiIdentityMarker,
  join: JoinPath,
): void {
  try {
    const userdata = join(dir, "userdata");
    NodeFS.mkdirSync(userdata, { recursive: true });
    const path = join(userdata, NEXI_IDENTITY_MARKER_NAME);
    if (NodeFS.existsSync(path)) return;
    NodeFS.writeFileSync(
      path,
      `${JSON.stringify({ ...marker, product: "nexi-work", at: marker.at ?? nowIsoForMigration() }, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch {
    // A read-only or already-written marker must not prevent startup.
  }
}

export function detectHomeOwnership(homeDir: string, join: JoinPath): HomeOwnership {
  const userdata = join(homeDir, "userdata");
  if (!isRealStateDb(userdata, join) && readNexiIdentityMarker(homeDir, join) === undefined) {
    // An empty dir, or one with only a marker, or a hollow leftover.
    if (!NodeFS.existsSync(homeDir)) return "empty";
    try {
      if (NodeFS.lstatSync(homeDir).isSymbolicLink()) {
        // Ownership of a symlink is the target's, resolved below by the caller when needed.
      }
    } catch {
      return "empty";
    }
    if (!isRealStateDb(userdata, join)) return "empty";
  }
  if (readNexiIdentityMarker(homeDir, join) !== undefined) return "nexi";
  const base = NodePath.basename(homeDir);
  if (isNexiUserDataDirName(base)) return isRealStateDb(userdata, join) ? "nexi" : "empty";
  if (isUpstreamHomeDirName(homeDir)) return isRealStateDb(userdata, join) ? "upstream" : "empty";
  return isRealStateDb(userdata, join) ? "unknown" : "empty";
}

export function detectProfileOwnership(
  profileDir: string,
  join: JoinPath,
  adjacentNexiHome?: string,
): HomeOwnership {
  if (readNexiIdentityMarker(profileDir, join) !== undefined) return "nexi";
  if (
    adjacentNexiHome &&
    detectHomeOwnership(adjacentNexiHome, join) === "nexi" &&
    isRealStateDb(join(adjacentNexiHome, "userdata"), join)
  ) {
    return "nexi";
  }
  const base = NodePath.basename(profileDir);
  if (isNexiUserDataDirName(base) || base === "electron-profile") {
    // electron-profile lives inside the Nexi home; if the parent is Nexi, already handled.
    if (NodeFS.existsSync(join(profileDir, "Local State"))) return "nexi";
  }
  if (isUpstreamProfileDirName(profileDir)) {
    return NodeFS.existsSync(join(profileDir, "Local State")) ? "upstream" : "empty";
  }
  if (!NodeFS.existsSync(profileDir)) return "empty";
  return NodeFS.existsSync(join(profileDir, "Local State")) ? "unknown" : "empty";
}

const sha256File = (path: string): string => {
  try {
    const hash = NodeCrypto.createHash("sha256");
    hash.update(NodeFS.readFileSync(path));
    return hash.digest("hex");
  } catch {
    return "";
  }
};

function writeStamp(destDir: string, stamp: MigrationStamp, join: JoinPath): string {
  const userdata = NodeFS.existsSync(join(destDir, "userdata"))
    ? join(destDir, "userdata")
    : destDir;
  NodeFS.mkdirSync(userdata, { recursive: true });
  const path = join(userdata, MIGRATION_STAMP_NAME);
  if (!NodeFS.existsSync(path)) {
    NodeFS.writeFileSync(path, `${JSON.stringify(stamp, null, 2)}\n`, { flag: "wx" });
  }
  return path;
}

export function writeMigrationStatus(dir: string, status: MigrationStatus, join: JoinPath): void {
  const userdata = NodeFS.existsSync(join(dir, "userdata")) ? join(dir, "userdata") : dir;
  NodeFS.mkdirSync(userdata, { recursive: true });
  const path = join(userdata, MIGRATION_STATUS_NAME);
  NodeFS.writeFileSync(path, `${JSON.stringify(status, null, 2)}\n`);
}

export function readMigrationStatus(dir: string, join: JoinPath): MigrationStatus | undefined {
  for (const candidate of [
    join(dir, "userdata", MIGRATION_STATUS_NAME),
    join(dir, MIGRATION_STATUS_NAME),
  ]) {
    try {
      return JSON.parse(NodeFS.readFileSync(candidate, "utf8")) as MigrationStatus;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function migrationWarningForUser(status: MigrationStatus | undefined): string | undefined {
  if (!status) return undefined;
  if (status.warning) return status.warning;
  if (
    status.safeStorage === "unknown" ||
    status.safeStorage === "failed" ||
    status.safeStorage === "unavailable"
  ) {
    return SAFE_STORAGE_SIGN_IN_WARNING;
  }
  if (status.home === "verify-failed" || status.profile === "verify-failed") {
    return "Nexi Work could not verify a copy of your previous data. The original files were left in place and were not deleted.";
  }
  return undefined;
}

function shouldSkipName(name: string, skip: ReadonlySet<string>): boolean {
  return skip.has(name) || name.startsWith("userdata.empty-") || name === MIGRATION_STAMP_NAME;
}

export function copyTreeNoOverwrite(input: {
  readonly source: string;
  readonly destination: string;
  readonly join: JoinPath;
  readonly skipNames?: ReadonlySet<string>;
  /** Dest files at or below this size (for state DBs) may be moved aside so a real copy can land. */
  readonly replaceEmptyStateFiles?: boolean;
  readonly stamp?: string;
}): { readonly files: number; readonly bytes: number } {
  const skip = input.skipNames ?? new Set<string>();
  let files = 0;
  let bytes = 0;

  const walk = (src: string, dest: string): void => {
    let lst: NodeFS.Stats;
    try {
      lst = NodeFS.lstatSync(src);
    } catch {
      return;
    }
    if (lst.isSymbolicLink()) {
      if (!NodeFS.existsSync(dest)) {
        try {
          NodeFS.symlinkSync(NodeFS.readlinkSync(src), dest);
          files += 1;
        } catch {
          // A dangling or unsupported symlink must not abort the rest of the copy.
        }
      }
      return;
    }
    if (lst.isDirectory()) {
      NodeFS.mkdirSync(dest, { recursive: true });
      for (const entry of NodeFS.readdirSync(src)) {
        if (shouldSkipName(entry, skip)) continue;
        walk(input.join(src, entry), input.join(dest, entry));
      }
      return;
    }
    if (NodeFS.existsSync(dest)) {
      if (
        input.replaceEmptyStateFiles &&
        (NodePath.basename(dest) === "statev2.sqlite" ||
          NodePath.basename(dest) === "state.sqlite") &&
        fileSizeOrZero(dest) <= EMPTY_STATE_DB_MAX_BYTES &&
        lst.size > EMPTY_STATE_DB_MAX_BYTES
      ) {
        const aside = `${dest}.empty-${input.stamp ?? "migration"}`;
        if (!NodeFS.existsSync(aside)) {
          NodeFS.renameSync(dest, aside);
        } else {
          return;
        }
      } else {
        return;
      }
    }
    NodeFS.copyFileSync(src, dest);
    files += 1;
    bytes += lst.size;
  };

  walk(input.source, input.destination);
  return { files, bytes };
}

function sameResolvedPath(a: string, b: string): boolean {
  try {
    if (NodeFS.lstatSync(a).isSymbolicLink() || NodeFS.lstatSync(b).isSymbolicLink()) {
      return NodeFS.realpathSync(a) === NodeFS.realpathSync(b);
    }
    return NodeFS.realpathSync(a) === NodeFS.realpathSync(b);
  } catch {
    return false;
  }
}

function isSymlinkTo(maybeLink: string, target: string): boolean {
  try {
    if (!NodeFS.lstatSync(maybeLink).isSymbolicLink()) return false;
    return NodeFS.realpathSync(maybeLink) === NodeFS.realpathSync(target);
  } catch {
    return false;
  }
}

function verifyHomeCopy(
  source: string,
  dest: string,
  join: JoinPath,
): { ok: boolean; reason?: string } {
  const srcBytes = stateBytes(join(source, "userdata"), join);
  const destBytes = stateBytes(join(dest, "userdata"), join);
  if (srcBytes > EMPTY_STATE_DB_MAX_BYTES && destBytes <= EMPTY_STATE_DB_MAX_BYTES) {
    return { ok: false, reason: "destination state database is missing or empty after the copy" };
  }
  if (srcBytes > EMPTY_STATE_DB_MAX_BYTES && destBytes < srcBytes) {
    return { ok: false, reason: "destination state database is smaller than the source" };
  }
  return { ok: true };
}

function verifyProfileCopy(
  source: string,
  dest: string,
  join: JoinPath,
): { ok: boolean; reason?: string } {
  if (!NodeFS.existsSync(join(dest, "Local State"))) {
    return { ok: false, reason: "destination profile is missing Local State" };
  }
  if (sameResolvedPath(source, dest)) {
    return { ok: false, reason: "destination profile is the same path as the source" };
  }
  return { ok: true };
}

export interface HomeMigrationResult {
  readonly home: string;
  readonly copied: boolean;
  readonly status: MigrationStatus["home"];
}

/**
 * Copy a Nexi-owned legacy home into the branded one. Never moves, deletes, or
 * overwrites real user data. Never adopts an upstream-owned `~/.t3`. Idempotent.
 * Returns the directory the backend should use.
 */
export function migrateNexiHome(input: {
  readonly legacyDir: string;
  readonly brandedDir: string;
  readonly join: JoinPath;
  readonly stamp: string;
  readonly now?: string;
}): HomeMigrationResult {
  const { legacyDir, brandedDir, join, stamp } = input;
  const at = input.now ?? nowIsoForMigration();

  if (legacyDir === brandedDir)
    return { home: brandedDir, copied: false, status: "skipped-existing" };
  if (sameResolvedPath(legacyDir, brandedDir) || isSymlinkTo(legacyDir, brandedDir)) {
    // Both names are the same home. Optionally replace a symlink at ~/.t3 with a real copy
    // so upstream and Nexi no longer share one directory.
    restoreSymlinkedLegacyHome({ legacyDir, brandedDir, join, stamp, at });
    return { home: brandedDir, copied: false, status: "skipped-existing" };
  }
  if (isSymlinkTo(legacyDir, brandedDir) === false) {
    try {
      if (NodeFS.lstatSync(legacyDir).isSymbolicLink()) {
        // Symlink to some other home (another install). Leave it and the target alone.
        return { home: brandedDir, copied: false, status: "fresh" };
      }
    } catch {
      // no legacy dir
    }
  }

  if (isRealStateDb(join(brandedDir, "userdata"), join)) {
    return { home: brandedDir, copied: false, status: "skipped-existing" };
  }

  const ownership = detectHomeOwnership(legacyDir, join);
  if (ownership === "empty") return { home: brandedDir, copied: false, status: "fresh" };
  if (ownership !== "nexi") {
    writeMigrationStatus(
      brandedDir,
      {
        at,
        home: "skipped-upstream",
        warning:
          ownership === "upstream"
            ? "An existing ~/.t3 directory belongs to another app and was left in place."
            : undefined,
      },
      join,
    );
    return { home: brandedDir, copied: false, status: "skipped-upstream" };
  }

  try {
    NodeFS.mkdirSync(brandedDir, { recursive: true });
    const copied = copyTreeNoOverwrite({
      source: legacyDir,
      destination: brandedDir,
      join,
      replaceEmptyStateFiles: true,
      stamp,
    });
    const verified = verifyHomeCopy(legacyDir, brandedDir, join);
    if (!verified.ok) {
      writeMigrationStatus(
        brandedDir,
        { at, home: "verify-failed", warning: verified.reason },
        join,
      );
      return { home: legacyDir, copied: false, status: "verify-failed" };
    }
    const dbPath = join(legacyDir, "userdata", "statev2.sqlite");
    const dbPathV1 = join(legacyDir, "userdata", "state.sqlite");
    const hashSource = fileSizeOrZero(dbPath) >= fileSizeOrZero(dbPathV1) ? dbPath : dbPathV1;
    writeStamp(
      brandedDir,
      {
        from: legacyDir,
        to: brandedDir,
        bytes: copied.bytes,
        sha256: sha256File(hashSource),
        at,
        kind: "home",
      },
      join,
    );
    writeNexiIdentityMarker(brandedDir, { product: "nexi-work", at }, join);
    writeMigrationStatus(brandedDir, { at, home: "ok" }, join);
    return { home: brandedDir, copied: true, status: "ok" };
  } catch {
    return { home: legacyDir, copied: false, status: "verify-failed" };
  }
}

/**
 * If `legacyDir` is a symlink to the branded Nexi home, replace that symlink
 * with a real copy so the two apps no longer share one directory. The Nexi
 * home is left untouched.
 */
function restoreSymlinkedLegacyHome(input: {
  readonly legacyDir: string;
  readonly brandedDir: string;
  readonly join: JoinPath;
  readonly stamp: string;
  readonly at: string;
}): void {
  const { legacyDir, brandedDir, join, stamp, at } = input;
  if (!isSymlinkTo(legacyDir, brandedDir)) return;
  const tmp = `${legacyDir}.restore-${stamp}`;
  const backup = `${legacyDir}.symlink-backup-${stamp}`;
  try {
    if (NodeFS.existsSync(tmp)) NodeFS.rmSync(tmp, { recursive: true, force: true });
    NodeFS.mkdirSync(tmp, { recursive: true });
    copyTreeNoOverwrite({
      source: brandedDir,
      destination: tmp,
      join,
      skipNames: new Set(["electron-profile", ...PROFILE_SKIP_NAMES]),
      stamp,
    });
    const verified = verifyHomeCopy(brandedDir, tmp, join);
    if (!verified.ok) {
      NodeFS.rmSync(tmp, { recursive: true, force: true });
      return;
    }
    NodeFS.renameSync(legacyDir, backup);
    NodeFS.renameSync(tmp, legacyDir);
    writeStamp(
      legacyDir,
      {
        from: brandedDir,
        to: legacyDir,
        bytes: stateBytes(join(legacyDir, "userdata"), join),
        sha256:
          sha256File(join(legacyDir, "userdata", "statev2.sqlite")) ||
          sha256File(join(legacyDir, "userdata", "state.sqlite")),
        at,
        kind: "symlink-restore",
      },
      join,
    );
  } catch {
    try {
      if (NodeFS.existsSync(backup) && !NodeFS.existsSync(legacyDir)) {
        NodeFS.renameSync(backup, legacyDir);
      }
    } catch {
      // Leave whatever is on disk; the branded home is still intact.
    }
  }
}

export interface ProfileMigrationResult {
  readonly profile: string;
  readonly copied: boolean;
  readonly status: MigrationStatus["profile"];
  readonly safeStorage: MigrationStatus["safeStorage"];
}

/**
 * Copy a Nexi-owned Chromium profile into the isolated profile directory.
 * Leaves the source (t3code-v2) in place. Skips lock files. Never overwrites.
 */
export function migrateNexiProfile(input: {
  readonly sourceProfileDir: string;
  readonly destinationProfileDir: string;
  readonly join: JoinPath;
  readonly stamp: string;
  readonly adjacentNexiHome?: string;
  readonly platform?: NodeJS.Platform;
  readonly now?: string;
}): ProfileMigrationResult {
  const { sourceProfileDir, destinationProfileDir, join, stamp } = input;
  const at = input.now ?? nowIsoForMigration();

  if (
    sourceProfileDir === destinationProfileDir ||
    sameResolvedPath(sourceProfileDir, destinationProfileDir)
  ) {
    return {
      profile: destinationProfileDir,
      copied: false,
      status: "skipped-existing",
      safeStorage: "not-needed",
    };
  }

  if (NodeFS.existsSync(join(destinationProfileDir, "Local State"))) {
    return {
      profile: destinationProfileDir,
      copied: false,
      status: "skipped-existing",
      safeStorage: "not-needed",
    };
  }

  if (!NodeFS.existsSync(join(sourceProfileDir, "Local State"))) {
    return {
      profile: destinationProfileDir,
      copied: false,
      status: "fresh",
      safeStorage: "not-needed",
    };
  }

  const ownership = detectProfileOwnership(sourceProfileDir, join, input.adjacentNexiHome);
  if (ownership !== "nexi") {
    return {
      profile: destinationProfileDir,
      copied: false,
      status: "skipped-upstream",
      safeStorage: "not-needed",
    };
  }

  try {
    NodeFS.mkdirSync(destinationProfileDir, { recursive: true });
    copyTreeNoOverwrite({
      source: sourceProfileDir,
      destination: destinationProfileDir,
      join,
      skipNames: PROFILE_SKIP_NAMES,
      stamp,
    });
    const verified = verifyProfileCopy(sourceProfileDir, destinationProfileDir, join);
    if (!verified.ok) {
      writeMigrationStatus(
        destinationProfileDir,
        { at, profile: "verify-failed", warning: verified.reason },
        join,
      );
      return {
        profile: destinationProfileDir,
        copied: false,
        status: "verify-failed",
        safeStorage: "unknown",
      };
    }
    writeStamp(
      destinationProfileDir,
      {
        from: sourceProfileDir,
        to: destinationProfileDir,
        bytes: fileSizeOrZero(join(destinationProfileDir, "Local State")),
        sha256: sha256File(join(destinationProfileDir, "Local State")),
        at,
        kind: "profile",
      },
      join,
    );
    writeNexiIdentityMarker(destinationProfileDir, { product: "nexi-work", at }, join);
    // Encryption is verified after Electron is ready, when safeStorage can run.
    const safeStorage: MigrationStatus["safeStorage"] =
      input.platform === "win32" ? "windows-local-state" : "pending";
    writeMigrationStatus(destinationProfileDir, { at, profile: "ok", safeStorage }, join);
    if (input.adjacentNexiHome) {
      writeMigrationStatus(
        input.adjacentNexiHome,
        {
          ...(readMigrationStatus(input.adjacentNexiHome, join) ?? { at }),
          profile: "ok",
          safeStorage,
        },
        join,
      );
    }
    return { profile: destinationProfileDir, copied: true, status: "ok", safeStorage };
  } catch {
    return {
      profile: destinationProfileDir,
      copied: false,
      status: "verify-failed",
      safeStorage: "unknown",
    };
  }
}

/**
 * Upgrade path used at startup: consider `~/.t3` as a source and the branded
 * or isolated home as the destination, then consider the shared `t3code-v2`
 * profile as a source for the isolated Electron profile.
 */
export function migrateExistingNexiUser(input: {
  readonly defaultLegacyHome: string;
  readonly brandedHome: string;
  readonly sharedProfileDir: string | undefined;
  readonly isolatedProfileDir: string | undefined;
  readonly join: JoinPath;
  readonly stamp: string;
  readonly platform: NodeJS.Platform;
  readonly appId?: string;
  readonly productName?: string;
}): {
  readonly home: string;
  readonly homeResult: HomeMigrationResult;
  readonly profileResult?: ProfileMigrationResult | undefined;
} {
  const homeResult = migrateNexiHome({
    legacyDir: input.defaultLegacyHome,
    brandedDir: input.brandedHome,
    join: input.join,
    stamp: input.stamp,
  });
  let profileResult: ProfileMigrationResult | undefined;
  if (input.isolatedProfileDir !== undefined && input.sharedProfileDir !== undefined) {
    profileResult = migrateNexiProfile({
      sourceProfileDir: input.sharedProfileDir,
      destinationProfileDir: input.isolatedProfileDir,
      join: input.join,
      stamp: input.stamp,
      adjacentNexiHome: input.brandedHome,
      platform: input.platform,
    });
  }
  const markedHome =
    homeResult.home === input.brandedHome &&
    isRealStateDb(input.join(input.brandedHome, "userdata"), input.join)
      ? input.brandedHome
      : homeResult.home;
  writeNexiIdentityMarker(
    markedHome,
    {
      product: "nexi-work",
      appId: input.appId,
      productName: input.productName,
    },
    input.join,
  );
  return { home: homeResult.home, homeResult, profileResult };
}
