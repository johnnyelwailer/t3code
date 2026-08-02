/** Cached TypeScript compiler host for checking source files outside the host installation. */

import type * as TsApi from "typescript";

import { loadTypeScript } from "./typescript.ts";

export function typeCheckCompilerOptions(ts: typeof TsApi): TsApi.CompilerOptions {
  return {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Preserve,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
    types: [],
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
  };
}

export interface TypeCheckHostStats {
  programs: number;
  parsed: number;
  cacheHits: number;
}

export interface TypeCheckHost {
  readonly ts: typeof TsApi;
  readonly host: TsApi.CompilerHost;
  readonly options: TsApi.CompilerOptions;
  readonly stats: TypeCheckHostStats;
  readonly overrides: Map<string, string>;
  lastProgram: TsApi.Program | undefined;
  readonly resolveFromAnchor: (specifier: string) => string | undefined;
}

const isRelative = (specifier: string): boolean =>
  specifier.startsWith("./") || specifier.startsWith("../");

const hostsByAnchor = new Map<string, TypeCheckHost>();

export function getTypeCheckHost(anchorPath: string): TypeCheckHost {
  const existing = hostsByAnchor.get(anchorPath);
  if (existing !== undefined) return existing;

  const ts = loadTypeScript();
  const options = typeCheckCompilerOptions(ts);
  const base = ts.createCompilerHost(options, true);
  const stats: TypeCheckHostStats = { programs: 0, parsed: 0, cacheHits: 0 };
  const overrides = new Map<string, string>();
  const cache = new Map<string, TsApi.SourceFile | undefined>();

  const baseGetSourceFile = base.getSourceFile.bind(base);
  const baseFileExists = base.fileExists.bind(base);
  const baseReadFile = base.readFile.bind(base);

  base.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = overrides.get(fileName);
    const key = text === undefined ? fileName : `${fileName}\u0000${text}`;
    if (cache.has(key)) {
      stats.cacheHits += 1;
      return cache.get(key);
    }
    stats.parsed += 1;
    const created =
      text === undefined
        ? baseGetSourceFile(fileName, languageVersion, onError, shouldCreate)
        : ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS);
    cache.set(key, created);
    return created;
  };
  base.fileExists = (fileName) => overrides.has(fileName) || baseFileExists(fileName);
  base.readFile = (fileName) => overrides.get(fileName) ?? baseReadFile(fileName);
  base.resolveModuleNameLiterals = (literals, containingFile) =>
    literals.map((literal) =>
      ts.resolveModuleName(
        literal.text,
        isRelative(literal.text) ? containingFile : anchorPath,
        options,
        base,
      ),
    );

  const created: TypeCheckHost = {
    ts,
    host: base,
    options,
    stats,
    overrides,
    lastProgram: undefined,
    resolveFromAnchor: (specifier) =>
      ts.resolveModuleName(specifier, anchorPath, options, base).resolvedModule?.resolvedFileName,
  };
  hostsByAnchor.set(anchorPath, created);
  return created;
}

export function resetTypeCheckHosts(): void {
  hostsByAnchor.clear();
}
