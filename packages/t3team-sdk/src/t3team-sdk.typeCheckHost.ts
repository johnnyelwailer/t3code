/**
 * The compiler host behind the `"types"` audit facet: how a workflow that lives OUTSIDE any
 * install gets typechecked against the host's own installation.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 * An authored workflow lives at `<workspace>/.t3team/recipes/<id>/workflow.ts`. There is no
 * `tsconfig` anywhere in a scaffolded workspace and no `node_modules` up its tree, so
 * `import { agent } from "@t3team/sdk"` cannot resolve for TYPES there — and a `paths` mapping
 * baked into a scaffolded tsconfig would be an absolute machine path committed into the user's
 * repo, breaking on every upgrade, reinstall, or second machine. Silently, too: every type in the
 * body would degrade to `any`, which looks exactly like a passing typecheck.
 *
 * `t3team-projectRecipeModuleResolution.ts` solves only the RUNTIME half — Node's `registerHooks`
 * has no effect whatsoever on TypeScript's type resolution.
 *
 * ── The mechanism: anchor redirection ────────────────────────────────────────
 * The workflow is compiled AT ITS REAL PATH, so relative imports (`./child.workflow.ts`) and every
 * diagnostic position stay truthful. Only BARE specifiers are redirected: they resolve as if
 * written from a file inside this package, where `@t3team/sdk` and `effect` are of course
 * resolvable. TypeScript's own resolver does the work, so `exports` maps, `types` conditions and
 * pnpm's symlinked layout are honoured exactly — nothing here hardcodes where `effect` keeps its
 * `.d.ts` files, which is the part that would rot on the next dependency bump.
 *
 * ── Erased imports ───────────────────────────────────────────────────────────
 * The loader blanks a body's imports and binds the verbs from the run, but the body is typechecked
 * AS AUTHORED — `import { agent } from "@t3team/sdk"` must resolve, and `noUnusedLocals` is off so
 * an import the loader will erase is never reported as unused. That is not a workflow bug and must
 * not read like one.
 */

import * as NodeModule from "node:module";
import * as NodeURL from "node:url";

import type * as TsApi from "typescript";

const nodeRequire = NodeModule.createRequire(import.meta.url);

/** Bare specifiers resolve as if written from HERE — the one directory where they resolve. */
export function defaultAnchorPath(): string {
  return NodeURL.fileURLToPath(import.meta.url);
}

/**
 * Deliberately close to `tsconfig.base.json` where it catches real mistakes (`strict`) and
 * deliberately lax where it would only generate noise:
 *   • `skipLibCheck` — `effect`'s own declarations are not the author's problem, and checking them
 *     costs seconds;
 *   • `noUnusedLocals`/`noUnusedParameters` — see §Erased imports above;
 *   • `types: []` — a workflow must not depend on whichever `@types/*` the host happens to install.
 *     `lib.dom` supplies the `crypto` global the determinism contract journals, without dragging in
 *     all of Node.
 * `allowImportingTsExtensions` is required because bodies import `"./x.workflow.ts"` WITH the
 * extension, and it is legal only under `noEmit`.
 */
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

/** Behavioural cache counters — asserted by the tests instead of wall-clock timings. */
export interface TypeCheckHostStats {
  /** Programs created since this host was built. */
  programs: number;
  /** Source files parsed (the cost the cache exists to avoid). */
  parsed: number;
  /** Source files served from the cache. */
  cacheHits: number;
}

export interface TypeCheckHost {
  readonly ts: typeof TsApi;
  readonly host: TsApi.CompilerHost;
  readonly options: TsApi.CompilerOptions;
  readonly stats: TypeCheckHostStats;
  /** In-memory contents for the file under audit, so a rendered or unsaved body can be checked
   * without touching the user's disk. */
  readonly overrides: Map<string, string>;
  /** The previous program, handed back to `createProgram` for structure reuse. */
  lastProgram: TsApi.Program | undefined;
  /** Resolve a bare specifier from the anchor; `undefined` when it does not resolve at all. */
  readonly resolveFromAnchor: (specifier: string) => string | undefined;
}

const isRelative = (specifier: string): boolean =>
  specifier.startsWith("./") || specifier.startsWith("../");

/**
 * One host per anchor, kept for the life of the process. This is the cache that matters: the
 * `lib.*.d.ts` files plus `effect`'s declaration graph are hundreds of files and dominate the cost
 * of a validate, while an authoring agent calls `t3team.recipe.validate` repeatedly. They are
 * immutable for the process's lifetime, so they are parsed once; only the workflow under audit is
 * re-read, keyed by its own text so an edited body always reparses.
 */
const hostsByAnchor = new Map<string, TypeCheckHost>();

export function getTypeCheckHost(anchorPath: string): TypeCheckHost {
  const existing = hostsByAnchor.get(anchorPath);
  if (existing !== undefined) return existing;

  const ts = nodeRequire("typescript") as typeof TsApi;
  const options = typeCheckCompilerOptions(ts);
  const base = ts.createCompilerHost(options, /* setParentNodes */ true);
  const stats: TypeCheckHostStats = { programs: 0, parsed: 0, cacheHits: 0 };
  const overrides = new Map<string, string>();
  const cache = new Map<string, TsApi.SourceFile | undefined>();

  const baseGetSourceFile = base.getSourceFile.bind(base);
  const baseFileExists = base.fileExists.bind(base);
  const baseReadFile = base.readFile.bind(base);

  base.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = overrides.get(fileName);
    // The audited file is versioned by its own text; every other file by name alone, because a
    // dependency's declarations cannot change while the process runs.
    // `\u0000` as the separator, written as an escape: a path cannot contain it, so the key is
    // unambiguous, and a literal NUL byte in source breaks grep/diff and makes `file` report binary.
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

/** Drop every cached host — test-only, so one test's anchor cannot leak into the next. */
export function resetTypeCheckHosts(): void {
  hostsByAnchor.clear();
}
