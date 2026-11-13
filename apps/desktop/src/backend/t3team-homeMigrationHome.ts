// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import * as NodeFS from "node:fs";

import {
  type JoinPath,
  type MigrationStatus,
  nowIso,
  PROFILE_SKIP_NAMES,
} from "./t3team-homeMigrationTypes.ts";
import {
  detectHomeOwnership,
  fileSizeOrZero,
  isRealStateDb,
  stateBytes,
  writeNexiIdentityMarker,
} from "./t3team-homeMigrationOwnership.ts";
import {
  copyTreeNoOverwrite,
  isSymlinkTo,
  sameResolvedPath,
  sha256File,
  verifyHomeCopy,
  writeMigrationStatus,
  writeStamp,
} from "./t3team-homeMigrationCopy.ts";

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
  const at = input.now ?? nowIso();

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
