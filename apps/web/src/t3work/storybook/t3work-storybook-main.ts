/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import type { StorybookConfig } from "@storybook/react-vite";
import * as NodeURL from "node:url";
import * as NodeModule from "node:module";
import { mergeConfig, type Plugin } from "vite";

const srcDir =
  process.env.T3WORK_STORYBOOK_SRC_DIR ?? NodeURL.fileURLToPath(new URL("../src", import.meta.url));

/**
 * Storybook 9's builder-vite generates a virtual `vite-app.js` that imports
 * Storybook's runtime via subpath exports (`storybook/internal/preview/runtime`,
 * `storybook/internal/csf`, ...). Those subpaths are declared in the `storybook`
 * package's `exports` map, not as real files on disk, and — because `storybook`
 * is a transitive peer that pnpm never hoists to the app's node_modules —
 * vite-plus's `vite:import-analysis` cannot resolve them from the *virtual*
 * importer (no real base dir to walk). The dev server then throws
 * `Failed to resolve import "storybook/internal/*"` and the preview canvas hangs.
 *
 * We build a specifier -> absolute-dist-file map straight from the installed
 * `storybook` package's own `exports` map (found by chaining through
 * `@storybook/react-vite`, which is the only Storybook dep reachable from the
 * app). This is version-agnostic: no hardcoded paths, no downgrade, and it keeps
 * working across Storybook upgrades as long as the `exports` shape holds.
 */
// Subpaths that builder-vite's virtual `vite-app.js` imports at runtime. If a
// future Storybook reshapes its `exports` map so these stop resolving, we want a
// loud named failure here rather than a silently hung preview canvas.
const REQUIRED_STORYBOOK_SUBPATHS = [
  "storybook/internal/preview/runtime",
  "storybook/internal/csf",
] as const;

/**
 * Resolve a package `exports` entry to a single relative target string.
 * Handles conditional objects (nested), arrays (fallback list), and strings —
 * so it stays correct if Storybook adopts nested conditions like
 * `{ import: { types, default } }` in a future release.
 */
function resolveExportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolveExportTarget(entry);
      if (resolved !== null) return resolved;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const conditions = value as Record<string, unknown>;
    for (const key of ["import", "module", "browser", "default", "require", "node"]) {
      if (key in conditions) {
        const resolved = resolveExportTarget(conditions[key]);
        if (resolved !== null) return resolved;
      }
    }
  }
  return null;
}

function buildStorybookResolveMap(baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  // `require`/URL only (no node:fs/node:path — those trip the Effect tsgo rule).
  const req = NodeModule.createRequire(`${baseDir}/t3work-storybook-resolver.cjs`);
  const reactViteReq = NodeModule.createRequire(req.resolve("@storybook/react-vite/package.json"));
  const sbPkgPath = reactViteReq.resolve("storybook/package.json");
  const sbPkgUrl = NodeURL.pathToFileURL(sbPkgPath);
  const pkg = reactViteReq("storybook/package.json") as { exports?: Record<string, unknown> };
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (!key.startsWith(".") || key === "./package.json") continue;
    const target = resolveExportTarget(value);
    if (target === null || target.endsWith(".json")) continue;
    const specifier = key === "." ? "storybook" : `storybook/${key.slice(2)}`;
    // Resolve the relative dist target against the package.json's file URL.
    map.set(specifier, NodeURL.fileURLToPath(new URL(target, sbPkgUrl)));
  }
  if (map.size === 0) {
    throw new Error(
      "[t3work-storybook] Could not derive any `storybook/*` subpath resolutions from the installed storybook package.",
    );
  }
  const missing = REQUIRED_STORYBOOK_SUBPATHS.filter((subpath) => !map.has(subpath));
  if (missing.length > 0) {
    throw new Error(
      `[t3work-storybook] Storybook's builder-vite runtime subpath(s) [${missing.join(", ")}] could not be resolved from the installed storybook package's exports map. The exports shape likely changed in a Storybook upgrade; update buildStorybookResolveMap accordingly.`,
    );
  }
  return map;
}

/**
 * Generalized `enforce: "pre"` resolver that rewrites the `storybook/*` subpath
 * exports to their real dist files before vite-plus's import-analysis runs.
 */
function t3workStorybookResolver(baseDir: string): Plugin {
  const resolveMap = buildStorybookResolveMap(baseDir);
  return {
    name: "t3work-storybook-subpath-resolver",
    enforce: "pre",
    resolveId(source) {
      return resolveMap.get(source) ?? null;
    },
  };
}

const config: StorybookConfig = {
  stories: [`${srcDir}/t3work/stories/**/*.stories.tsx`],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    // The app's vite.config.ts (inherited by builder-vite) force-includes
    // `@clerk/clerk-js` in optimizeDeps. Its wallet subdeps are stripped via
    // pnpm overrides, so it fails to prebundle in Storybook and is never used
    // by any story. Drop it from the inherited include list.
    if (Array.isArray(config.optimizeDeps?.include)) {
      config.optimizeDeps.include = config.optimizeDeps.include.filter(
        (dep) => dep !== "@clerk/clerk-js",
      );
    }
    return mergeConfig(config, {
      plugins: [
        t3workStorybookResolver(srcDir),
        babel({
          parserOpts: { plugins: ["typescript", "jsx"] },
          presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
      ],
      resolve: {
        alias: {
          "~": srcDir,
        },
      },
      server: {
        // The launcher passes `--host 127.0.0.1`; accept both loopback names so
        // opening either http://localhost:6006 or http://127.0.0.1:6006 works.
        allowedHosts: ["localhost", "127.0.0.1"],
      },
      define: {
        "import.meta.env.VITE_WS_URL": JSON.stringify(""),
        "import.meta.env.VITE_HOSTED_APP_URL": JSON.stringify(""),
        "import.meta.env.VITE_HOSTED_APP_CHANNEL": JSON.stringify("storybook"),
        "import.meta.env.APP_VERSION": JSON.stringify("storybook"),
        __ATLASSIAN_CLIENT_ID__: JSON.stringify(""),
        __ATLASSIAN_SITE_URL__: JSON.stringify(""),
        __ATLASSIAN_OAUTH_REDIRECT_URI__: JSON.stringify(""),
      },
    });
  },
};

export default config;
