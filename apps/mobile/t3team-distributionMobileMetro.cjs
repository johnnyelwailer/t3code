// @ts-check
/**
 * The mobile twin of the web build's distribution plugin (apps/web/scripts/t3team-distributionWebPlugin.ts).
 *
 * With `T3CODE_DISTRIBUTION` naming a distribution whose `mobile.json` declares `overlay.entry`,
 * `@t3code/distribution-mobile` resolves to that entry (a default export `MobileExtensions`)
 * instead of the empty stub `src/t3team-distributionMobile.ts`, so the overlay is compiled into the
 * app with the app's trust. Without it this hook steps aside: the app is the stock app plus the
 * stub and the registry.
 *
 * Overlay code is held to one copy of everything and to a stated surface:
 *   - a bare import from an overlay file resolves as if the app wrote it, never from a
 *     node_modules next to the overlay, so React, effect and every native module stay single;
 *   - an overlay file may import only direct dependencies of this app, `@t3code/mobile-api` (the
 *     explicit surface in `src/extensions/t3team-api.ts`) and its own files; anything else, including
 *     deep imports of app internals, fails the build;
 *   - the overlay directory is added to Tailwind's sources, so its utility classes are built.
 *
 * It fails closed: paths are canonicalised (a symlinked checkout, macOS /tmp -> /private/tmp, cannot
 * make a comparison miss), and the serializer refuses to emit a bundle that contains the registry
 * but not the selected overlay, so a redirect that stops matching is a build error, never an APK
 * that quietly ships the stock app.
 */
const fs = require("node:fs");
const path = require("node:path");

const SPECIFIER = "@t3code/distribution-mobile";
const API_SPECIFIER = "@t3code/mobile-api";
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
  if (allowedPackages.has(name)) return null;
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

/**
 * The CSS entry Uniwind should compile: the app's own for a stock build; for a selected overlay a
 * generated wrapper that imports it and adds Tailwind sources for the app and the pack (Tailwind
 * scans only the entry's directory unless told otherwise). Call before `withUniwindConfig` so the
 * lazy-graph registration and the compiled file agree.
 *
 * @param {string} original @param {{ appRoot: string, env?: Record<string, string | undefined> }} input
 */
function cssEntryFile(original, { appRoot, env = process.env }) {
  const selection = readDistributionMobile({ env, appRoot });
  if (selection === null) return original;
  const generated = generatedCss(appRoot);
  const css = [
    `@import ${JSON.stringify(path.resolve(appRoot, original))};`,
    `@source ${JSON.stringify(canonical(appRoot))};`,
    `@source ${JSON.stringify(selection.packDir)};`,
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(generated), { recursive: true });
  if (!fs.existsSync(generated) || fs.readFileSync(generated, "utf8") !== css) {
    fs.writeFileSync(generated, css);
  }
  // Uniwind joins the entry to process.cwd().
  return path.relative(process.cwd(), generated);
}

/** @param {string} appRoot */
const generatedCss = (appRoot) =>
  path.join(canonical(appRoot), ".generated", "distribution-mobile", "global.css");

/**
 * @template {import("metro-config").MetroConfig} C
 * @param {C} config
 * @param {{ appRoot: string, env?: Record<string, string | undefined> }} options
 * @returns {C}
 */
function withDistributionMobile(config, { appRoot, env = process.env }) {
  const selection = readDistributionMobile({ env, appRoot });
  if (selection === null) return config;
  const app = canonical(appRoot);
  const apiFile = path.join(app, "src", "extensions", "t3team-api.ts");
  const forkCss = path.join(app, "global.css");
  const pinnedOrigin = path.join(app, "package.json");
  const workspaceRoot = canonical(path.resolve(app, "..", ".."));
  const allowed = appDependencies(app);
  const previous = config.resolver?.resolveRequest;
  /** @type {Map<string, string>} */
  const canonicalCache = new Map();
  /** @param {string} file */
  const canon = (file) => {
    let value = canonicalCache.get(file);
    if (value === undefined) {
      value = canonical(file);
      canonicalCache.set(file, value);
    }
    return value;
  };

  const prior = config.serializer?.customSerializer;
  if (typeof prior !== "function") {
    fail("the Metro config has no custom serializer to hold the fail-closed bundle check");
  }

  return {
    ...config,
    watchFolders: [...new Set([...(config.watchFolders ?? []), selection.packDir])],
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        const next = previous ?? context.resolveRequest;
        if (moduleName === SPECIFIER) return { type: "sourceFile", filePath: selection.entryPath };
        if (moduleName === API_SPECIFIER) return { type: "sourceFile", filePath: apiFile };
        const origin = canon(context.originModulePath);
        const fromOverlay = isInside(selection.packDir, origin);
        // As in the pack plugin of the server build (t3team-distributionImportResolver.ts): any
        // file of the distribution checkout, outside this workspace and outside node_modules,
        // has its bare imports anchored to this app.
        const distributionImporter =
          fromOverlay ||
          (!origin.includes(`${path.sep}node_modules${path.sep}`) &&
            !isInside(workspaceRoot, origin));
        if (distributionImporter) {
          const problem = importProblem(moduleName, allowed);
          if (problem !== null) fail(`${context.originModulePath}: ${problem}`);
          if (isBare(moduleName)) {
            context = { ...context, originModulePath: pinnedOrigin };
          }
        }
        // Uniwind compiles only the CSS file it was configured with; the app's import of its own
        // entry has to land on the generated wrapper.
        if (
          moduleName.endsWith("global.css") &&
          canon(path.resolve(path.dirname(context.originModulePath), moduleName)) === forkCss
        ) {
          return { type: "sourceFile", filePath: generatedCss(app) };
        }
        const resolution = next(context, moduleName, platform);
        if (
          fromOverlay &&
          !isBare(moduleName) &&
          resolution.type === "sourceFile" &&
          !isInside(selection.packDir, canon(resolution.filePath))
        ) {
          fail(`${origin}: "${moduleName}" resolves outside the pack (${resolution.filePath})`);
        }
        return resolution;
      },
    },
    serializer: {
      ...config.serializer,
      customSerializer(entryPoint, preModules, graph, options) {
        assertOverlayBundled(graph, selection, app);
        return prior(entryPoint, preModules, graph, options);
      },
    },
  };
}

module.exports = {
  API_SPECIFIER,
  SPECIFIER,
  assertOverlayBundled,
  cssEntryFile,
  importProblem,
  readDistributionMobile,
  withDistributionMobile,
};
