/**
 * Which overlay a distribution compiles into the mobile app, and the checks that hold it to the
 * app: see `t3team-distributionMobileMetro.cjs` for how Metro uses them.
 */
const fs = require("node:fs");
const path = require("node:path");

const {
  overlayPackageFor,
  overlayRoots,
  readOverlayPackages,
  trackedFiles,
  trackedRoots,
} = require("./t3team-distributionMobilePackages.cjs");

const SPECIFIER = "@t3code/distribution-mobile";
const API_SPECIFIER = "@t3code/mobile-api";
/**
 * Packages the transform itself injects into any file (the dev profile turns async functions into
 * `@babel/runtime/helpers/asyncToGenerator` calls): not the overlay's choice, so not restricted.
 */
const COMPILER_RUNTIME = new Set(["@babel/runtime"]);
const PREFIX = "[t3code/distribution-mobile]";

/**
 * The packages an overlay file may import (besides `@t3code/mobile-api`, `@babel/runtime` and its own
 * files), as web's pack boundary states its `react`/`effect`/`@t3team/pack-ui`. Every entry is a
 * reviewed fork edit, justified here; the overlay typecheck links only these into its node_modules.
 */
const OVERLAY_PACKAGES = new Set([
  "react", // components and hooks
  "react-native", // View, Text, Platform, Linking
  "expo", // the native module bridge (requireOptionalNativeModule, NativeModule)
  "expo-constants", // `extra.nexi.env`, the distribution's build-time configuration
  "expo-font", // the brand display font
  "expo-image", // the brand wordmark
  "expo-secure-store", // the Entra refresh token
  "effect", // the connection errors and Effect-based gateway are the app's own
  "@t3tools/client-runtime", // connection errors, asset URL observer: the protocol client the app runs on
  "@t3tools/contracts", // protocol types
  "@react-navigation/native", // navigation hooks of the hosts list
  "@t3tools/shared", // the theme palettes and the pack theme overlay the web app uses too
  "expo-clipboard", // copy the device sign-in code
  "expo-network", // offline state of the start screen
  "react-native-reanimated", // the start screen's loading skeleton
  "react-native-safe-area-context", // insets of the start screen
]);

/** @param {string} message @returns {never} */
const fail = (message) => {
  throw new Error(`${PREFIX} ${message}`);
};

/** @param {string} target */
const canonical = (target) => {
  try {
    return fs.realpathSync.native(target);
  } catch {
    return path.resolve(target);
  }
};

/** @param {string} root @param {string} target */
const isInside = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

/** @param {string} source */
const isBare = (source) =>
  !source.startsWith(".") && !path.isAbsolute(source) && !/^[a-z][a-z\d+.-]*:/i.test(source);

/** @param {string} source */
const packageName = (source) => {
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? source);
};

/**
 * The overlay a distribution compiles into the app, or null when none is selected (no
 * `T3CODE_DISTRIBUTION`, or its `mobile.json` declares no overlay). Every other problem is an
 * error: an overlay that silently drops out of the build reads as "declared, so it must work".
 *
 * @param {{ env?: Record<string, string | undefined>, appRoot: string }} input
 * @returns {{ packDir: string, entryPath: string, nativeModulesDir: string | null, assetsDir: string | null, packages: import("./t3team-distributionMobilePackages.cjs").OverlayPackage[] } | null}
 */
function readDistributionMobile({ env = process.env, appRoot }) {
  void appRoot;
  const dir = env.T3CODE_DISTRIBUTION?.trim();
  // Only an unset or blank variable means "stock". A set one that names nothing usable is a mistake that
  // must not quietly produce a stock app (web fails the same way: readJson(distribution.json)).
  if (!dir) return null;
  const packDir = canonical(dir);
  if (!fs.existsSync(path.join(packDir, "distribution.json"))) {
    return fail(
      `T3CODE_DISTRIBUTION=${dir} is not a distribution directory (no distribution.json)`,
    );
  }
  const mobilePath = path.join(packDir, "mobile.json");
  if (!fs.existsSync(mobilePath)) {
    return fail(
      `the distribution ${packDir} has no mobile.json, so it cannot build the mobile app`,
    );
  }
  /** @type {{ overlay?: unknown }} */
  let mobile;
  try {
    mobile = JSON.parse(fs.readFileSync(mobilePath, "utf8"));
  } catch (cause) {
    return fail(`cannot read ${mobilePath}: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (mobile.overlay === undefined) return null;
  const entry =
    typeof mobile.overlay === "object" && mobile.overlay !== null
      ? /** @type {{ entry?: unknown }} */ (mobile.overlay).entry
      : undefined;
  if (typeof entry !== "string" || entry === "" || path.isAbsolute(entry)) {
    return fail(`${mobilePath} "overlay.entry" must be a path relative to the pack`);
  }
  const entryPath = canonical(path.resolve(packDir, entry));
  if (!isInside(packDir, entryPath)) {
    return fail(`overlay entry "${entry}" must stay inside the pack ${packDir}`);
  }
  if (!fs.existsSync(entryPath)) return fail(`overlay entry not found: ${entryPath}`);
  /** @param {string} field */
  const declaredDirectory = (field) => {
    const value = /** @type {Record<string, unknown>} */ (mobile.overlay)[field];
    if (value === undefined) return null;
    const dir = typeof value === "string" ? canonical(path.resolve(packDir, value)) : "";
    if (!dir || !isInside(packDir, dir) || !fs.existsSync(dir)) {
      return fail(`overlay.${field} must name a directory inside the pack ${packDir}`);
    }
    return dir;
  };
  return {
    packDir,
    entryPath,
    nativeModulesDir: declaredDirectory("nativeModules"),
    assetsDir: declaredDirectory("assets"),
    packages: readOverlayPackages(
      /** @type {Record<string, unknown>} */ (mobile.overlay).packages,
      {
        packDir,
        reserved: new Set([...OVERLAY_PACKAGES, API_SPECIFIER]),
        fail,
      },
    ),
  };
}

/**
 * Why an overlay file may not import `source`, or null. Relative imports are checked after
 * resolution (they must land inside the pack).
 *
 * @param {string} source @param {ReadonlySet<string>} allowedPackages
 */
function importProblem(source, allowedPackages = OVERLAY_PACKAGES) {
  if (!isBare(source)) return null;
  if (source === API_SPECIFIER) return null;
  const name = packageName(source);
  if (allowedPackages.has(name) || COMPILER_RUNTIME.has(name)) return null;
  return (
    `imports "${source}", which is not on the overlay's list (OVERLAY_PACKAGES in ` +
    `t3team-distributionMobileSelection.cjs) and is not ${API_SPECIFIER}; an overlay may use only those and its own files`
  );
}

/**
 * Refuses a bundle that holds the registry without the selected overlay (or with the stub still
 * in it). Chunks without the registry are not the app's main graph and pass.
 *
 * @param {{ dependencies: { has(key: string): boolean } }} graph
 * @param {{ entryPath: string }} selection
 * @param {string} appRoot
 */
function assertOverlayBundled(graph, selection, appRoot) {
  /** @param {string} file */
  const has = (file) => graph.dependencies.has(file) || graph.dependencies.has(canonical(file));
  const registry = path.join(appRoot, "src", "extensions", "t3team-extensions.ts");
  if (!has(registry)) return;
  const stub = path.join(appRoot, "src", "t3team-distributionMobile.ts");
  if (!has(selection.entryPath) || has(stub)) {
    fail(
      `T3CODE_DISTRIBUTION selected the overlay ${selection.entryPath}, but the bundle does not ` +
        `contain it (or still contains the stock stub): the import of ${SPECIFIER} was not ` +
        `redirected. Refusing to build an app that would ship without its overlay.`,
    );
  }
}

module.exports = {
  API_SPECIFIER,
  PREFIX,
  SPECIFIER,
  OVERLAY_PACKAGES,
  assertOverlayBundled,
  canonical,
  fail,
  importProblem,
  isBare,
  isInside,
  overlayPackageFor,
  overlayRoots,
  readDistributionMobile,
  trackedFiles,
  trackedRoots,
};
