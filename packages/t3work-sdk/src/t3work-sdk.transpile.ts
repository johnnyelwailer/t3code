/**
 * Transpile scaffolding for `.workflow.ts` loading: split the file at `meta`, blank the
 * `import`/`export`/`meta` spans, and transpile each half to a `vm.Script`-runnable string.
 *
 * This is pure source-rewriting plumbing — it makes NO allow/deny decisions. Every import
 * is blanked unconditionally (the one allowlisted value import, `Schema`, is injected as a
 * global instead); there is no banned-globals scan here. Stage-1 trusts project code (see
 * the {@link ./t3work-sdk.loader.ts} header).
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
    spans.push({ start: options.metaStatement.getStart(sourceFile), end: options.metaStatement.end });
  }
  return spans;
}
