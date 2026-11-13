// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import * as NodeFS from "node:fs";

import {
  type JoinPath,
  type MigrationStatus,
  nowIso,
  PROFILE_SKIP_NAMES,
} from "./t3team-homeMigrationTypes.ts";
import {
  detectProfileOwnership,
  fileSizeOrZero,
  writeNexiIdentityMarker,
} from "./t3team-homeMigrationOwnership.ts";

import {
  copyTreeNoOverwrite,
  readMigrationStatus,
  sameResolvedPath,
  sha256File,
  verifyProfileCopy,
  writeMigrationStatus,
  writeStamp,
} from "./t3team-homeMigrationCopy.ts";

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
  const at = input.now ?? nowIso();

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
    // Windows DPAPI unlocks a copied Local State for the same user; this stamp
    // is "copied", not Electron's live backend. macOS Keychain stays "unknown".
    const safeStorage: MigrationStatus["safeStorage"] =
      input.platform === "darwin" ? "unknown" : "copied";
    const warning =
      safeStorage === "unknown"
        ? "Nexi Work could not carry your encrypted sign-in onto this app identity. Your projects and threads are intact. Please sign in again."
        : undefined;
    writeMigrationStatus(destinationProfileDir, { at, profile: "ok", safeStorage, warning }, join);
    if (input.adjacentNexiHome) {
      writeMigrationStatus(
        input.adjacentNexiHome,
        {
          ...(readMigrationStatus(input.adjacentNexiHome, join) ?? { at }),
          profile: "ok",
          safeStorage,
          warning,
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
