"use strict";
/**
 * electron-builder `afterPack` hook: re-inject the `.d.ts` files that
 * electron-builder strips from app.asar with its hardcoded, non-configurable
 * filters.
 *
 * Two independent strips make this necessary (verified against
 * app-builder-lib 26.15.6):
 *
 * 1. The main file matcher appends a trailing .d.ts exclusion AFTER any user
 *    `files` patterns (fileMatcher.js, `getMainFileMatchers`), so no `files`
 *    include can re-add `apps/server/dist/lib` .d.ts files — the TypeScript
 *    lib declarations the inlined compiler's `getDefaultLibFilePath` resolves to.
 * 2. The node-module collector walks each dependency with a hardcoded
 *    `nodeModuleExcludedExts` list that includes `.d.ts`
 *    (util/appFileCopier.js `getNodeModuleExcludedExts` +
 *    util/NodeModuleCopyHelper.js `name.endsWith(ext)`), applied during the
 *    directory walk regardless of any file patterns — so every effect .d.ts
 *    file and `node_modules/typescript/lib/typescript.d.ts` never reach the
 *    asar.
 *
 * Without them the packaged typechecker degrades to "typecheck-unavailable"
 * (or ts7016 on every workflow) for every orchestration run.
 *
 * This hook runs inside electron-builder, AFTER app.asar is packed and BEFORE
 * the app is signed, so the re-packed asar is covered by the signature. It
 * re-streams every existing entry (preserving order, unpacked flags, and
 * executable bits) and appends the missing `.d.ts` files, using the same
 * `createPackageFromStreams` primitive electron-builder itself uses.
 *
 * Written into the staged app dir by scripts/build-desktop-artifact.ts, which
 * also writes the `desktop-asar-dts-afterpack.json` config next to this file
 * (stageAppDir, the repo scripts package.json used to resolve
 * `@electron/asar`, and the dtsDirectories/dtsFiles closure lists — the
 * single source of truth for what gets re-injected lives in
 * scripts/build-desktop-artifact.ts, so this hook stays data-driven).
 */

const NodeFS = require("node:fs");
const NodeModule = require("node:module");
const NodePath = require("node:path");
const NodeStream = require("node:stream");

const CONFIG_PATH = NodePath.join(__dirname, "desktop-asar-dts-afterpack.json");

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

module.exports = async function desktopAsarDtsAfterPack(context) {
  // electron-builder 26's afterPack context: { appOutDir, outDir, arch,
  // targets, packager, electronPlatformName } — there is no appPath/platform.
  const { appOutDir, electronPlatformName } = context;
  let config;
  try {
    config = JSON.parse(NodeFS.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    const raw = NodeFS.existsSync(CONFIG_PATH)
      ? NodeFS.readFileSync(CONFIG_PATH, "utf8")
      : "<missing>";
    console.error(`[desktop-asar-dts] config parse failed at ${CONFIG_PATH}: ${err.message}`);
    console.error(
      `[desktop-asar-dts] raw config (first 500): ${JSON.stringify(raw.slice(0, 500))}`,
    );
    throw err;
  }
  const { stageAppDir, repoScriptsPackageJson, dtsDirectories, dtsFiles } = config;
  if (!Array.isArray(dtsDirectories) || !Array.isArray(dtsFiles)) {
    return fail(
      `config at ${CONFIG_PATH} is missing the dtsDirectories/dtsFiles closure lists; ` +
        "re-run the desktop build script that writes this config",
    );
  }

  let asarPath;
  if (electronPlatformName === "darwin") {
    // Exactly one .app bundle is produced per appOutDir; resolve it by name
    // rather than from the product name (which may contain characters that
    // are awkward to interpolate into a path).
    const apps = NodeFS.readdirSync(appOutDir).filter((entry) => entry.endsWith(".app"));
    if (apps.length !== 1) {
      fail(`expected exactly one .app in ${appOutDir}, found: [${apps.join(", ")}]`);
    }
    asarPath = NodePath.join(appOutDir, apps[0], "Contents", "Resources", "app.asar");
  } else {
    asarPath = NodePath.join(appOutDir, "resources", "app.asar");
  }
  if (!NodeFS.existsSync(asarPath)) {
    console.log(`[desktop-asar-dts] no app.asar at ${asarPath}; nothing to do`);
    return;
  }

  const asar = NodeModule.createRequire(repoScriptsPackageJson)("@electron/asar");
  const { header, headerSize } = asar.getRawHeader(asarPath);

  // 1. Re-stream every existing entry, in header order, preserving unpacked
  //    flags and executable bits. Packed bodies are read at their recorded
  //    offset (body starts at 8 + headerSize, matching @electron/asar's own
  //    readFileSync); unpacked bodies come from the .unpacked sibling.
  const streams = [];
  const existingFiles = new Set();
  const walkHeader = (files, prefix) => {
    for (const [name, entry] of Object.entries(files)) {
      const rel = prefix === "" ? name : `${prefix}/${name}`;
      if (entry.files !== undefined) {
        streams.push({ path: rel, type: "directory", unpacked: entry.unpacked === true });
        walkHeader(entry.files, rel);
      } else if (entry.link !== undefined) {
        streams.push({
          path: rel,
          type: "link",
          unpacked: entry.unpacked === true,
          symlink: entry.link,
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

  // 2. The .d.ts files electron-builder stripped, sourced from the staged
  //    tree (which still has them — the strips happen during asar packing).
  //    The closure lists come from the build script via this hook's config
  //    (desktop-asar-dts-afterpack.json) — do not hardcode them here.
  const additions = [];
  const addDtsFromDir = (stageRel, asarRel) => {
    const dir = NodePath.join(stageAppDir, stageRel);
    if (!NodeFS.existsSync(dir)) {
      return fail(`staged source directory missing: ${dir}`);
    }
    for (const file of collectDtsFiles(dir)) {
      additions.push({
        asarRel: `${asarRel}/${NodePath.relative(dir, file)}`,
        disk: file,
      });
    }
  };
  for (const dir of dtsDirectories) {
    addDtsFromDir(dir, dir);
  }
  for (const file of dtsFiles) {
    const disk = NodePath.join(stageAppDir, file);
    if (!NodeFS.existsSync(disk)) {
      return fail(`staged .d.ts missing: ${disk}`);
    }
    additions.push({ asarRel: file, disk });
  }

  const fresh = additions.filter((addition) => !existingFiles.has(addition.asarRel));
  for (const { asarRel, disk } of fresh) {
    const stat = NodeFS.statSync(disk);
    streams.push({
      path: asarRel,
      type: "file",
      unpacked: false,
      stat: { size: stat.size, mode: stat.mode & 0o777, uid: 0, gid: 0, mtime: 0, atime: 0 },
      streamGenerator: () => NodeFS.createReadStream(disk),
    });
  }

  // 3. Repack to a sibling, then swap atomically. Unpacked files are written
  //    to the sibling's .unpacked dir by createPackageFromStreams, so the
  //    unpacked tree is swapped with the archive.
  const tmpAsar = `${asarPath}.dts-reinject`;
  const tmpUnpacked = `${tmpAsar}.unpacked`;
  const oldUnpacked = `${asarPath}.unpacked`;
  try {
    await asar.createPackageFromStreams(tmpAsar, streams);
    NodeFS.rmSync(asarPath, { force: true });
    NodeFS.renameSync(tmpAsar, asarPath);
    if (NodeFS.existsSync(tmpUnpacked)) {
      NodeFS.rmSync(oldUnpacked, { recursive: true, force: true });
      NodeFS.renameSync(tmpUnpacked, oldUnpacked);
    }
  } catch (error) {
    NodeFS.rmSync(tmpAsar, { force: true });
    NodeFS.rmSync(tmpUnpacked, { recursive: true, force: true });
    throw error;
  }

  console.log(
    `[desktop-asar-dts] re-injected ${String(fresh.length)} .d.ts file(s) into ${asarPath}`,
  );
};
