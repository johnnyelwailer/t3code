/**
 * Which overlay a distribution compiles into the mobile app, and the checks that hold it to the
 * app: see `t3team-distributionMobileMetro.cjs` for how Metro uses them.
 */
const fs = require("node:fs");
const path = require("node:path");

const SPECIFIER = "@t3code/distribution-mobile";
const API_SPECIFIER = "@t3code/mobile-api";
/**
 * Packages the transform itself injects into any file (the dev profile turns async functions into
 * `@babel/runtime/helpers/asyncToGenerator` calls): not the overlay's choice, so not restricted.
 */
const COMPILER_RUNTIME = new Set(["@babel/runtime"]);
const PREFIX = "[t3code/distribution-mobile]";

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
 * @returns {{ packDir: string, entryPath: string } | null}
 */
function readDistributionMobile({ env = process.env, appRoot }) {
  void appRoot;
  const dir = env.T3CODE_DISTRIBUTION?.trim();
  if (!dir) return null;
  const packDir = canonical(dir);
  const mobilePath = path.join(packDir, "mobile.json");
  if (!fs.existsSync(mobilePath)) return null;
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
  return { packDir, entryPath };
}

/**
 * Why an overlay file may not import `source`, or null. Relative imports are checked after
 * resolution (they must land inside the pack).
 *
 * @param {string} source @param {ReadonlySet<string>} allowedPackages
 */
function importProblem(source, allowedPackages) {
  if (!isBare(source)) return null;
  if (source === API_SPECIFIER) return null;
  const name = packageName(source);
  if (allowedPackages.has(name) || COMPILER_RUNTIME.has(name)) return null;
  return (
    `imports "${source}", which is neither a dependency of the mobile app nor ${API_SPECIFIER}; ` +
    `an overlay may use only those and its own files`
  );
}

/** @param {string} appRoot */
function appDependencies(appRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
  return new Set(Object.keys(manifest.dependencies ?? {}));
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
  appDependencies,
  assertOverlayBundled,
  canonical,
  fail,
  importProblem,
  isBare,
  isInside,
  readDistributionMobile,
};
