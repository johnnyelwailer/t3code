// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  type JoinPath,
  type MigrationStamp,
  type MigrationStatus,
  EMPTY_STATE_DB_MAX_BYTES,
  MIGRATION_STAMP_NAME,
  MIGRATION_STATUS_NAME,
} from "./t3team-homeMigrationTypes.ts";
import { fileSizeOrZero, stateBytes } from "./t3team-homeMigrationOwnership.ts";

export const sha256File = (path: string): string => {
  try {
    const hash = NodeCrypto.createHash("sha256");
    hash.update(NodeFS.readFileSync(path));
    return hash.digest("hex");
  } catch {
    return "";
  }
};

export function writeStamp(destDir: string, stamp: MigrationStamp, join: JoinPath): string {
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
  if (status.safeStorage === "unknown") {
    return "Nexi Work could not carry your encrypted sign-in onto this app identity. Your projects and threads are intact. Please sign in again.";
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

export function sameResolvedPath(a: string, b: string): boolean {
  try {
    if (NodeFS.lstatSync(a).isSymbolicLink() || NodeFS.lstatSync(b).isSymbolicLink()) {
      return NodeFS.realpathSync(a) === NodeFS.realpathSync(b);
    }
    return NodeFS.realpathSync(a) === NodeFS.realpathSync(b);
  } catch {
    return false;
  }
}

export function isSymlinkTo(maybeLink: string, target: string): boolean {
  try {
    if (!NodeFS.lstatSync(maybeLink).isSymbolicLink()) return false;
    return NodeFS.realpathSync(maybeLink) === NodeFS.realpathSync(target);
  } catch {
    return false;
  }
}

export function verifyHomeCopy(
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

export function verifyProfileCopy(
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
