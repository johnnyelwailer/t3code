"use strict";
/**
 * Helpers for the desktop asar .d.ts afterPack hook
 * (scripts/t3team-desktop-asar-dts-afterpack.cjs): the re-stream entry
 * builder for the existing asar entries and the .d.ts collector. Split out
 * for the additive guard's 200 non-empty line ceiling.
 */
const NodeFS = require("node:fs");
const NodePath = require("node:path");
const NodeStream = require("node:stream");

const fail = (message) => {
  // Throwing fails the electron-builder build (before signing), which is the
  // only acceptable outcome for a typechecker closure that is incomplete.
  console.error(`[desktop-asar-dts] ${message}`);
  throw new Error(message);
};

/** All `.d.ts` files under a directory, as absolute paths. */
function collectDtsFiles(rootDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
      const full = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(rootDir);
  return out;
}

/**
 * Re-stream entry list for every existing asar entry, in header order,
 * preserving unpacked flags and executable bits.
 */
function buildExistingEntryStreams({ asarPath, header, headerSize }) {
  const streams = [];
  const existingFiles = new Set();
  const walkHeader = (files, prefix) => {
    for (const [name, entry] of Object.entries(files)) {
      const rel = prefix === "" ? name : `${prefix}/${name}`;
      if (entry.files !== undefined) {
        streams.push({ path: rel, type: "directory", unpacked: entry.unpacked === true });
        walkHeader(entry.files, rel);
      } else if (entry.link !== undefined) {
        // `entry.link` is root-relative (from the asar header), but
        // `createPackageFromStreams` resolves `symlink` relative to the
        // link entry's own directory (see `@electron/asar`'s
        // `disk/filesystem.js` `Filesystem#insertLink`). Re-relativize it
        // against `rel`'s directory or a nested symlink resolves to the
        // wrong target on repack.
        streams.push({
          path: rel,
          type: "link",
          unpacked: entry.unpacked === true,
          symlink: NodePath.relative(NodePath.dirname(rel), entry.link),
          stat: { size: 0, mode: 0o644 },
        });
      } else {
        const unpacked = entry.unpacked === true;
        const size = entry.size ?? 0;
        existingFiles.add(rel);
        const offset = Number(entry.offset);
        streams.push({
          path: rel,
          type: "file",
          unpacked,
          stat: {
            size,
            mode: entry.executable ? 0o755 : 0o644,
            uid: 0,
            gid: 0,
            mtime: 0,
            atime: 0,
          },
          streamGenerator: () =>
            unpacked
              ? NodeFS.createReadStream(NodePath.join(`${asarPath}.unpacked`, rel))
              : size === 0
                ? NodeStream.Readable.from(Buffer.alloc(0))
                : NodeFS.createReadStream(asarPath, {
                    start: 8 + headerSize + offset,
                    end: 8 + headerSize + offset + size - 1,
                  }),
        });
      }
    }
  };
  walkHeader(header.files, "");
  return { streams, existingFiles };
}

/**
 * An unsigned build keeps Electron's linker signature on a changed bundle: invalid, so macOS calls a
 * downloaded copy "damaged". A complete ad-hoc seal is valid; macOS then offers Open Anyway in System
 * Settings. Runs last: nothing may change the bundle after it.
 */
function sealMacAppAdHoc(context, enabled, run = require("node:child_process").execFileSync) {
  if (!enabled || context.electronPlatformName !== "darwin") return undefined;
  const apps = NodeFS.readdirSync(context.appOutDir).filter((entry) => entry.endsWith(".app"));
  if (apps.length !== 1) {
    return fail(`expected exactly one .app in ${context.appOutDir}, found: [${apps.join(", ")}]`);
  }
  const appPath = NodePath.join(context.appOutDir, apps[0]);
  run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
  console.log(`[desktop-mac-adhoc-seal] sealed ${appPath} with a complete ad-hoc signature`);
  return appPath;
}

module.exports = { fail, collectDtsFiles, buildExistingEntryStreams, sealMacAppAdHoc };
