// @effect-diagnostics nodeBuiltinImport:off - home and profile migration is a synchronous startup step on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  type JoinPath,
  type HomeOwnership,
  type NexiIdentityMarker,
  EMPTY_STATE_DB_MAX_BYTES,
  NEXI_IDENTITY_MARKER_NAME,
  nowIso,
} from "./t3team-homeMigrationTypes.ts";

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

function isNexiUserDataDirName(name: string): boolean {
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
      `${JSON.stringify({ ...marker, product: "nexi-work", at: marker.at ?? nowIso() }, null, 2)}\n`,
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
