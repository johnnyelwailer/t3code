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

const {
  API_SPECIFIER,
  SPECIFIER,
  OVERLAY_PACKAGES,
  assertOverlayBundled,
  canonical,
  fail,
  importProblem,
  isBare,
  isInside,
  overlayRoots,
  readDistributionMobile,
} = require("./t3team-distributionMobileSelection.cjs");

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
    ...overlayRoots(selection).map((root) => `@source ${JSON.stringify(root)};`),
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
          const problem = importProblem(moduleName, OVERLAY_PACKAGES);
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
        // Relative imports, assets included, stay inside the pack.
        const resolved =
          resolution.type === "sourceFile"
            ? [resolution.filePath]
            : resolution.type === "assetFiles"
              ? resolution.filePaths
              : [];
        if (fromOverlay && !isBare(moduleName)) {
          const outside = resolved.find((file) => !isInside(selection.packDir, canon(file)));
          if (outside !== undefined)
            fail(`${origin}: "${moduleName}" resolves outside the pack (${outside})`);
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
  OVERLAY_PACKAGES,
  SPECIFIER,
  assertOverlayBundled,
  cssEntryFile,
  importProblem,
  readDistributionMobile,
  withDistributionMobile,
};
