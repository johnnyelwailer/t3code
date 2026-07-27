/**
 * Shared types + AST helpers for the two load-time static audits of a `.workflow.ts`
 * (Epic 25 phase 25.5 — "Determinism enforcement: lint rules flagging nondeterminism patterns,
 * capability gating at load time"):
 *
 *   • {@link ./t3team-sdk.determinismScan.ts} — determinism findings.
 *   • {@link ./t3team-sdk.capabilityScan.ts}  — `meta.capabilities` findings.
 *
 * Both are pure source inspection over the same TypeScript AST the loader already parses; the
 * body is never executed. Positions are 1-based line/column so an agent can jump to the site.
 */
import type * as TsApi from "typescript";

export type WorkflowAuditFacet = "determinism" | "capability";

export interface WorkflowAuditFinding {
  readonly facet: WorkflowAuditFacet;
  /** Stable rule id, e.g. `"runtime-import"` / `"missing-capability"`. */
  readonly rule: string;
  /** The offending construct's source text, truncated. */
  readonly construct: string;
  readonly line: number;
  readonly column: number;
  /** Author-facing explanation, including the fix. */
  readonly message: string;
}

const MAX_CONSTRUCT = 80;

export function truncateConstruct(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_CONSTRUCT ? `${oneLine.slice(0, MAX_CONSTRUCT - 1)}…` : oneLine;
}

/** 1-based line/column of a node's start, from the source file's own line map. */
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

/** Render a finding as a single validation-error line: `rule (line:col): message [construct]`. */
export function formatFinding(item: WorkflowAuditFinding): string {
  return `${item.rule} at ${item.line}:${item.column}: ${item.message} (offending construct: \`${item.construct}\`)`;
}

/**
 * The leftmost identifier of a member chain (`tools.github.pull.merge` → `tools`), plus the
 * dotted remainder after it (`"github.pull.merge"`). Returns null for a computed/dynamic chain,
 * so `tools[name]` is never guessed at.
 */
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

/**
 * Every binding name introduced anywhere in the file (imports, declarations, parameters,
 * functions, classes, catch clauses). Used to suppress a global-reference finding when the
 * author declared or shadowed that name themselves — a miss is cheaper than a false positive.
 */
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

/** True when this identifier occurrence is a reference, not a name slot (property, label, …). */
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
