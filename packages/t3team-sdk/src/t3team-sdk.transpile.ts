/**
 * Transpile scaffolding for `.workflow.ts` loading: split the file at `meta`, blank the
 * `import`/`export`/`meta` spans, and transpile each half to a `vm.Script`-runnable string.
 *
 * This is pure source-rewriting plumbing — it makes NO allow/deny decisions. Every import
 * is blanked unconditionally (the one allowlisted value import, `Schema`, is injected as a
 * global instead); there is no banned-globals scan here. Stage-1 trusts project code (see
 * the {@link ./t3team-sdk.loader.ts} header).
 */

import type * as TsApi from "typescript";

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Replace every non-newline char in each span with a space. Length preserved, so spans
 * collected from the original AST stay valid regardless of application order. */
export function blankSpans(text: string, spans: ReadonlyArray<Span>): string {
  let result = text;
  for (const span of spans) {
    const slice = result.slice(span.start, span.end).replace(/[^\n]/g, " ");
    result = result.slice(0, span.start) + slice + result.slice(span.end);
  }
  return result;
}

export function transpile(ts: typeof TsApi, code: string, fileName: string): string {
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName,
  }).outputText;
}

export function findMetaStatement(
  ts: typeof TsApi,
  sourceFile: TsApi.SourceFile,
): TsApi.VariableStatement | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaresMeta = statement.declarationList.declarations.some(
      (decl) => ts.isIdentifier(decl.name) && decl.name.text === "meta",
    );
    if (declaresMeta) return statement;
  }
  return undefined;
}

/**
 * The name of the body's default-exported function, if it has one.
 *
 * This is what makes the module-shaped body (`export default async function run() { … }`) runnable
 * by the SAME vm path as a legacy top-level-statement body: `export`/`default` are blanked like any
 * other modifier, which leaves a declared-but-never-called function, so the loader appends a call to
 * this name. Keeping one execution path is what preserves journaled `Date`/`Math`/`crypto` for the
 * new shape — a real ESM `import()` cannot intercept those.
 *
 * Returns undefined for a legacy body. A default export that is NOT a named function declaration
 * (an arrow, a class, an identifier) is reported by the loader as an authoring error rather than
 * silently doing nothing.
 */
export function findDefaultExportedFunctionName(
  ts: typeof TsApi,
  sourceFile: TsApi.SourceFile,
): { readonly name?: string; readonly hasDefaultExport: boolean } {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) return { hasDefaultExport: true };
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isDefaultExport =
      modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) === true;
    if (!isDefaultExport) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      return { name: statement.name.text, hasDefaultExport: true };
    }
    return { hasDefaultExport: true };
  }
  return { hasDefaultExport: false };
}

export function collectBlankSpans(
  ts: typeof TsApi,
  sourceFile: TsApi.SourceFile,
  options: { readonly includeMeta: boolean; readonly metaStatement: TsApi.VariableStatement },
): Span[] {
  const spans: Span[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
      spans.push({ start: statement.getStart(sourceFile), end: statement.end });
      continue;
    }
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    for (const modifier of modifiers ?? []) {
      if (
        modifier.kind === ts.SyntaxKind.ExportKeyword ||
        modifier.kind === ts.SyntaxKind.DefaultKeyword ||
        modifier.kind === ts.SyntaxKind.DeclareKeyword
      ) {
        spans.push({ start: modifier.getStart(sourceFile), end: modifier.end });
      }
    }
  }
  if (options.includeMeta) {
    spans.push({
      start: options.metaStatement.getStart(sourceFile),
      end: options.metaStatement.end,
    });
  }
  return spans;
}
