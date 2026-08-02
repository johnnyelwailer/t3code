/**
 * Source-rewriting helpers for TypeScript workflow loading.
 *
 * This module deliberately makes no policy decisions. It only blanks module scaffolding and
 * transpiles the resulting source into JavaScript that the loader can execute. The host decides
 * which globals and capabilities are injected into the execution context.
 */

import type * as TsApi from "typescript";

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Replace every non-newline character in each span, preserving source offsets. */
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

/** Find a named default-exported function. Other default-export forms are intentionally rejected. */
export function findDefaultExportedFunctionName(
  ts: typeof TsApi,
  sourceFile: TsApi.SourceFile,
): { readonly name?: string; readonly hasDefaultExport: boolean } {
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) return { hasDefaultExport: true };
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isDefaultExport =
      modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) === true;
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
