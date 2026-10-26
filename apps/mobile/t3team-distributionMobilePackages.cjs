/**
 * Packages an overlay may import from outside its pack: `overlay.packages` of `mobile.json` maps a
 * package name to the directory of a private source package (nx-nexi's `shared/packages/*`, which
 * the overlay shares with the portal). Only the declared name resolves, to the package's `main`
 * file; its own files are tracked like the overlay's (runtime version, Gradle bundle inputs), its
 * relative imports must stay inside its source directory, and deep imports stay refused.
 */
const fs = require("node:fs");
const path = require("node:path");

/** @param {string} target */
const canonical = (target) => {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
};

/**
 * @typedef {{ name: string, dir: string, entry: string, sourceDir: string, manifest: string }} OverlayPackage
 * @param {unknown} declared `overlay.packages`
 * @param {{ packDir: string, reserved: ReadonlySet<string>, fail: (message: string) => never }} input
 * @returns {OverlayPackage[]}
 */
function readOverlayPackages(declared, { packDir, reserved, fail }) {
  if (declared === undefined) return [];
  if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
    return fail(`overlay.packages must map a package name to a directory`);
  }
  return Object.entries(declared).map(([name, value]) => {
    if (reserved.has(name))
      return fail(`overlay.packages "${name}" is already on the overlay's list`);
    const dir = typeof value === "string" ? canonical(path.resolve(packDir, value)) : "";
    const manifestPath = path.join(dir, "package.json");
    if (!dir || !fs.existsSync(manifestPath)) {
      return fail(`overlay.packages "${name}" must name a package directory (with a package.json)`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.name !== name || typeof manifest.main !== "string") {
      return fail(`overlay.packages "${name}": ${manifestPath} must have that name and a "main"`);
    }
    const entry = canonical(path.resolve(dir, manifest.main));
    if (
      !fs.existsSync(entry) ||
      !fs.statSync(entry).isFile() ||
      path.relative(dir, entry).startsWith("..")
    ) {
      return fail(
        `overlay.packages "${name}": main ${manifest.main} must be a file inside the package`,
      );
    }
    return { name, dir, entry, sourceDir: path.dirname(entry), manifest: canonical(manifestPath) };
  });
}

/** @param {{ packages: OverlayPackage[] }} selection @param {string} moduleName */
const overlayPackageFor = (selection, moduleName) =>
  selection.packages.find((pkg) => pkg.name === moduleName);

/**
 * The directories with the overlay's code: its entry's directory and its native modules (Tailwind
 * scans these for class names).
 *
 * @param {{ entryPath: string, nativeModulesDir: string | null }} selection
 */
function overlayRoots(selection) {
  return [
    path.dirname(selection.entryPath),
    ...(selection.nativeModulesDir ? [selection.nativeModulesDir] : []),
  ];
}

/**
 * Every directory the overlay may import from: its code, native modules, assets and the source
 * directories of its declared packages (the directory of each package's `main`: when `main` sits at
 * the package root that is the whole package, tests included). Relative imports and assets must resolve inside them, so the
 * runtime version, the Gradle bundle inputs and Tailwind's scan cover everything that can reach a bundle.
 *
 * @param {{ entryPath: string, nativeModulesDir: string | null, assetsDir: string | null, packages: OverlayPackage[] }} selection
 */
function trackedRoots(selection) {
  return [
    ...overlayRoots(selection),
    ...(selection.assetsDir ? [selection.assetsDir] : []),
    ...selection.packages.map((pkg) => pkg.sourceDir),
  ];
}

/**
 * Single files the bundle depends on besides the tracked directories: the declared packages'
 * manifests. Changing a package's `main` changes which file is the entry without touching any file
 * under its source directory, so the manifest is hashed and a Gradle input too.
 *
 * @param {{ packages: OverlayPackage[] }} selection
 */
const trackedFiles = (selection) => selection.packages.map((pkg) => pkg.manifest);

module.exports = {
  overlayPackageFor,
  overlayRoots,
  readOverlayPackages,
  trackedFiles,
  trackedRoots,
};
