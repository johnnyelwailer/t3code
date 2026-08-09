/** Generic finding and TypeScript-AST helpers shared by trusted workflow audits. */

import type * as TsApi from "typescript";

export type WorkflowAuditFacet = "determinism" | "capability" | "types";

export interface WorkflowAuditFinding {
  readonly facet: WorkflowAuditFacet;
  readonly rule: string;
  readonly construct: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

const MAX_CONSTRUCT = 80;

export function truncateConstruct(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_CONSTRUCT ? `${oneLine.slice(0, MAX_CONSTRUCT - 1)}…` : oneLine;
}

export function positionOf(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  node: TsApi.Node,
): { readonly line: number; readonly column: number } {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { line: line + 1, column: character + 1 };
}

export function finding(
  ts: typeof TsApi,
  sf: TsApi.SourceFile,
  node: TsApi.Node,
  input: { readonly facet: WorkflowAuditFacet; readonly rule: string; readonly message: string },
): WorkflowAuditFinding {
  return {
    facet: input.facet,
    rule: input.rule,
    construct: truncateConstruct(node.getText(sf)),
    ...positionOf(ts, sf, node),
    message: input.message,
  };
}

export function findingAt(
  sf: TsApi.SourceFile,
  start: number,
  length: number,
  input: { readonly facet: WorkflowAuditFacet; readonly rule: string; readonly message: string },
): WorkflowAuditFinding {
  const { line, character } = sf.getLineAndCharacterOfPosition(start);
  return {
    facet: input.facet,
    rule: input.rule,
    construct: truncateConstruct(sf.text.slice(start, start + Math.max(length, 1))),
    line: line + 1,
    column: character + 1,
    message: input.message,
  };
}

export function findingWithoutPosition(input: {
  readonly facet: WorkflowAuditFacet;
  readonly rule: string;
  readonly message: string;
}): WorkflowAuditFinding {
  return { ...input, construct: "", line: 1, column: 1 };
}

export function formatFinding(item: WorkflowAuditFinding): string {
  return `${item.rule} at ${item.line}:${item.column}: ${item.message} (offending construct: \`${item.construct}\`)`;
}

export function memberChain(
  ts: typeof TsApi,
  expr: TsApi.Expression,
): { readonly root: string; readonly path: ReadonlyArray<string> } | null {
  const segments: string[] = [];
  let current: TsApi.Expression = expr;
  while (ts.isPropertyAccessExpression(current)) {
    segments.unshift(current.name.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  return { root: current.text, path: segments };
}

export function collectDeclaredNames(ts: typeof TsApi, sf: TsApi.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  const addBindingName = (name: TsApi.Node | undefined): void => {
    if (name === undefined) return;
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    ts.forEachChild(name, addBindingName);
  };
  const visit = (node: TsApi.Node): void => {
    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isImportSpecifier(node) ||
      ts.isImportClause(node) ||
      ts.isNamespaceImport(node) ||
      ts.isCatchClause(node)
    ) {
      addBindingName(
        ts.isCatchClause(node)
          ? node.variableDeclaration?.name
          : ((node as { readonly name?: TsApi.Node }).name ?? undefined),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

export function isValueReference(ts: typeof TsApi, node: TsApi.Identifier): boolean {
  const parent = node.parent as TsApi.Node | undefined;
  if (parent === undefined) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent))
    return parent.name !== node;
  return true;
}
