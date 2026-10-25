// @effect-diagnostics nodeBuiltinImport:off - synchronous file reads for a build-time CLI check.
/**
 * Build-time check that every bare import in the emitted server bundle resolves from the packaged app.
 *
 * The packaged server ships no workspace node_modules, so a bare `import "x"` left in `dist/*.mjs`
 * crashes the backend on first boot (ERR_MODULE_NOT_FOUND) and the app shows a Dock icon and no window.
 * The bundler silently leaves an import external when it cannot resolve it from the importer
 * (distribution files outside the workspace, 2026-10-25: `ws`, `jose`).
 */
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

const STATIC_BARE_IMPORT =
  /^(?:import|export)\b[^;]*?\bfrom\s+"([^./"][^"]*)";?$|^import\s+"([^./"][^"]*)";?$/gm;

export const packageNameOf = (specifier: string): string => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
};

// The bundler hoists every static import to the top of a chunk. Text after the first statement can
// be embedded source (a template string holding a TypeScript extension) whose imports are not ours.
const FIRST_STATEMENT =
  /^(?:const|let|var|function|class|async|\/\*|Object\b|if\b|for\b|[([]|[A-Za-z_$][\w$.]*\()/;

export const leadingImportBlock = (source: string): string => {
  const lines = source.split("\n");
  const end = lines.findIndex((line) => FIRST_STATEMENT.test(line));
  return (end === -1 ? lines : lines.slice(0, end)).join("\n");
};

/** Static bare imports in the import header of one emitted chunk, as package names (builtins excluded). */
export const bareImportPackages = (source: string): ReadonlyArray<string> => {
  const names = new Set<string>();
  for (const match of leadingImportBlock(source).matchAll(STATIC_BARE_IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (!specifier || specifier.startsWith("node:")) continue;
    const name = packageNameOf(specifier);
    if (NodeModule.builtinModules.includes(specifier) || NodeModule.builtinModules.includes(name))
      continue;
    names.add(name);
  }
  return [...names];
};

export interface UnresolvableImport {
  readonly file: string;
  readonly packageName: string;
}

export const findUnresolvableImports = (input: {
  readonly chunks: ReadonlyArray<{ readonly file: string; readonly source: string }>;
  readonly hasPackage: (packageName: string) => boolean;
}): ReadonlyArray<UnresolvableImport> =>
  input.chunks.flatMap(({ file, source }) =>
    bareImportPackages(source)
      .filter((packageName) => !input.hasPackage(packageName))
      .map((packageName) => ({ file, packageName })),
  );

interface AsarNode {
  readonly files?: Record<string, AsarNode>;
  readonly offset?: string;
  readonly size?: number;
  readonly unpacked?: boolean;
}

/** Minimal asar reader: the header is a pickled JSON tree, file bytes follow it. */
export const readAsar = (file: string) => {
  const readAt = (position: number, length: number): Buffer => {
    const fd = NodeFS.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(length);
      NodeFS.readSync(fd, buffer, 0, length, position);
      return buffer;
    } finally {
      NodeFS.closeSync(fd);
    }
  };
  const prefix = readAt(0, 16);
  const root = JSON.parse(readAt(16, prefix.readUInt32LE(12)).toString("utf8")) as AsarNode;
  const base = 8 + prefix.readUInt32LE(4);
  const node = (path: string): AsarNode | undefined =>
    path
      .split("/")
      .filter(Boolean)
      .reduce<AsarNode | undefined>((current, part) => current?.files?.[part], root);
  return {
    has: (path: string) => node(path) !== undefined,
    list: (path: string) => Object.keys(node(path)?.files ?? {}),
    read: (path: string): string => {
      const entry = node(path);
      if (!entry || entry.offset === undefined || entry.size === undefined) {
        throw new Error(`asar entry not found or unpacked: ${path}`);
      }
      return readAt(base + Number(entry.offset), entry.size).toString("utf8");
    },
  };
};

/** Check a packaged app's `Resources` directory (macOS: `Nexi Work.app/Contents/Resources`). */
export const checkPackagedApp = (resourcesDir: string): ReadonlyArray<UnresolvableImport> => {
  const asar = readAsar(NodePath.join(resourcesDir, "app.asar"));
  const distDir = "apps/server/dist";
  const chunks = asar
    .list(distDir)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => ({ file: `${distDir}/${name}`, source: asar.read(`${distDir}/${name}`) }));
  if (chunks.length === 0) throw new Error(`No ${distDir}/*.mjs in ${resourcesDir}/app.asar`);
  const roots = [
    NodePath.join(resourcesDir, "node_modules"),
    NodePath.join(resourcesDir, "app.asar.unpacked", "node_modules"),
  ];
  const hasPackage = (packageName: string) =>
    ["apps/server/node_modules", "node_modules"].some((dir) =>
      asar.has(`${dir}/${packageName}/package.json`),
    ) || roots.some((root) => NodeFS.existsSync(NodePath.join(root, packageName, "package.json")));
  return findUnresolvableImports({ chunks, hasPackage });
};
