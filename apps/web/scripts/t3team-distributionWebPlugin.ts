// @effect-diagnostics nodeBuiltinImport:off - build-time bundler plugin; it runs outside any Effect runtime.
/**
 * `@t3code/distribution-web` — the web twin of the server's `@t3code/distribution` build input.
 *
 * With `T3CODE_DISTRIBUTION` set, the virtual module lists the web entry (`contents.views`) of
 * every pack the distribution compiles in, as static imports bound to their pack ids; the app
 * activates them once into the view registry. Without it, this plugin steps aside and the specifier
 * resolves through tsconfig `paths` to the empty stub `src/t3team-distributionWeb.ts` — same shape,
 * so a build without a distribution is byte-for-byte the app it was before.
 *
 * Pack code is compiled into the app, with the app's trust. To keep one copy of everything:
 *   • `@t3team/pack-ui` resolves to the app's implementation, for every importer;
 *   • a pack file's other bare imports (`react`, `effect`) resolve from this app, never from a
 *     node_modules next to the pack;
 *   • the pack directories are added to Tailwind's sources, so their utility classes are built.
 *
 * And it holds packs to the kit: a pack whose declared `pack-ui` range excludes this app's
 * `PACK_UI_VERSION` fails the build, and so does any pack-file import other than `react`,
 * `effect`, `@t3team/pack-ui` and the pack's own files.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { PACK_UI_VERSION } from "@t3team/pack-ui/contract";
import { packWebImportProblem, readDistributionWebEntries } from "@t3team/packs/distribution-web";
import type { Plugin } from "vite-plus";

const SPECIFIER = "@t3code/distribution-web";
const VIRTUAL_ID = "\0@t3code/distribution-web";
const PACK_UI = "@t3team/pack-ui";

const canonical = (path: string): string => {
  try {
    return NodeFS.realpathSync.native(path);
  } catch {
    return NodePath.resolve(path);
  }
};

const isBareSpecifier = (source: string): boolean =>
  !source.startsWith(".") &&
  !source.startsWith("/") &&
  !source.startsWith("\0") &&
  !/^[a-z]+:/i.test(source);

function distributionModule(entries: ReturnType<typeof readDistributionWebEntries>): string {
  const imports = entries.map(
    (entry, index) => `import * as __pack${index} from ${JSON.stringify(entry.entryPath)};`,
  );
  const activations = entries.map(
    (entry, index) =>
      `  { packId: ${JSON.stringify(entry.packId)}, activate: __pack${index}.default ?? __pack${index}.activate },`,
  );
  return [...imports, "export const webActivations = [", ...activations, "];", ""].join("\n");
}

export function t3teamDistributionWebPlugin(paths: {
  /** The app's `@t3team/pack-ui` implementation. */
  readonly packUiImplementation: string;
  /** The app stylesheet that imports Tailwind. */
  readonly stylesheet: string;
  /** Any app module; a pack's bare imports resolve as if imported from it. */
  readonly appModule: string;
}): Plugin {
  const dir = process.env.T3CODE_DISTRIBUTION?.trim();
  const entries = dir
    ? readDistributionWebEntries(canonical(dir), { packUiVersion: PACK_UI_VERSION })
    : [];
  const packDirs = [...new Set(entries.map((entry) => canonical(entry.packDir)))];
  // Module ids are realpaths, as the pack dirs are; a symlinked checkout makes the configured
  // stylesheet path differ from its id, so match either spelling.
  const stylesheets = new Set([paths.stylesheet, canonical(paths.stylesheet)]);
  const packDirOf = (importer: string) =>
    packDirs.find((packDir) => importer.startsWith(packDir + NodePath.sep));
  return {
    name: "t3code-distribution-web",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === SPECIFIER) return dir ? VIRTUAL_ID : null;
      if (source === PACK_UI) return paths.packUiImplementation;
      const importerPath = importer?.split("?")[0];
      const packDir = importerPath === undefined ? undefined : packDirOf(importerPath);
      if (importerPath === undefined || packDir === undefined) return null;
      const problem = packWebImportProblem(source, { importer: importerPath, packDir });
      if (problem !== null) throw new Error(`[t3code/distribution-web] ${importer}: ${problem}`);
      if (!isBareSpecifier(source)) return null;
      return this.resolve(source, paths.appModule, { skipSelf: true });
    },
    load(id) {
      return id === VIRTUAL_ID ? distributionModule(entries) : null;
    },
    transform(code, id) {
      if (packDirs.length === 0 || !stylesheets.has(id.split("?")[0] ?? id)) return null;
      return `${code}\n${packDirs.map((packDir) => `@source ${JSON.stringify(packDir)};`).join("\n")}\n`;
    },
  };
}
